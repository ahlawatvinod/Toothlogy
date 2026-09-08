/**
 * TOOTHLOGY PLUGIN KERNEL
 *
 * Founding spec §23. Future capabilities are added as plugins that declare what
 * they need, without creating uncontrolled coupling.
 *
 * The governing rule: **a plugin declares; it does not reach in.**
 *
 * A plugin manifest lists the permissions, routes, APIs, entities, tools,
 * integrations, events, config and flags it requires. The kernel validates those
 * declarations against the registries and wires them. A plugin never imports
 * another plugin's internals — if it needs something, it declares a dependency
 * and the kernel guarantees load order.
 *
 * That constraint is what stops a plugin system from becoming a second,
 * undisciplined codebase. Once plugins can reach into each other, load order
 * becomes load-bearing in ways nobody documented, and removing any plugin breaks
 * three others.
 *
 * Validation happens at load, not at first use. A plugin declaring a permission
 * that does not exist fails at startup — where it is one error message — rather
 * than at 2am when a user first reaches the route.
 *
 * ✅ IMPLEMENTED: manifest contract, validation, dependency resolution, load
 * ordering, lifecycle hooks.
 * 🔴 NOT IMPLEMENTED: no plugins exist, and nothing is loaded at boot.
 */

import { isKnownEvent } from '@/registry/events';
import { FLAG_BY_KEY } from '@/registry/flags';
import { isKnownPermission } from '@/registry/permissions';
import type { Phase } from '@/registry/types';
import { AppError, ERROR_CODES } from '@/platform/kernel/errors';
import { logger } from '@/platform/observability/logger';

export interface PluginRoute {
  readonly path: string;
  readonly permissions: readonly string[];
}

export interface PluginApi {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly permissions: readonly string[];
}

/**
 * What a plugin declares about itself.
 *
 * Everything a plugin needs is named here, so its blast radius is readable
 * without reading its code — which is what makes a plugin reviewable, and what
 * lets the kernel refuse one that asks for more than it should.
 */
export interface PluginManifest {
  /** Stable ID following the registry grammar. Never reused. */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly divisionId: string;
  readonly phase: Phase;

  /** IDs of plugins that must load first. */
  readonly dependsOn?: readonly string[];
  /** Permission keys the plugin uses. Must already exist in the registry. */
  readonly permissions?: readonly string[];
  readonly routes?: readonly PluginRoute[];
  readonly apis?: readonly PluginApi[];
  /** Prisma model names the plugin owns. */
  readonly entities?: readonly string[];
  /** Tool IDs the plugin consumes. */
  readonly tools?: readonly string[];
  /** Integration IDs the plugin requires. */
  readonly integrations?: readonly string[];
  /** Registered event names it publishes or subscribes to. */
  readonly events?: readonly string[];
  /** Env var names it reads. Names only — never values. */
  readonly config?: readonly string[];
  /** Feature flag gating the whole plugin. */
  readonly flag?: string;
  /** Test suite paths proving it works. */
  readonly tests?: readonly string[];

  /** Called once at load, after dependencies. Wire providers and subscribers here. */
  readonly setup?: (context: PluginContext) => void | Promise<void>;
  /** Called on shutdown, in reverse load order. */
  readonly teardown?: () => void | Promise<void>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly logger: ReturnType<typeof logger.child>;
}

interface LoadedPlugin {
  readonly manifest: PluginManifest;
  readonly loadedAt: Date;
}

const loaded = new Map<string, LoadedPlugin>();

/**
 * Validate a manifest against the registries.
 *
 * Returns all problems rather than the first, so a plugin author fixes one list
 * instead of rediscovering the next error on each retry.
 */
export function validateManifest(manifest: PluginManifest): string[] {
  const problems: string[] = [];

  if (!/^TL-[A-Z0-9]+(-[A-Z0-9]+)*-\d{3}$/.test(manifest.id)) {
    problems.push(`Plugin ID '${manifest.id}' does not match TL-<SEGMENTS>-<NNN>.`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    problems.push(`Version '${manifest.version}' is not semantic (major.minor.patch).`);
  }

  // A plugin cannot invent permissions. Permissions are reviewed centrally and
  // granted to roles; letting a plugin define its own would let it grant itself
  // access that no one approved.
  for (const permission of manifest.permissions ?? []) {
    if (!isKnownPermission(permission)) {
      problems.push(`Declares unregistered permission '${permission}'.`);
    }
  }

  for (const event of manifest.events ?? []) {
    if (!isKnownEvent(event)) problems.push(`Declares unregistered event '${event}'.`);
  }

  if (manifest.flag && !FLAG_BY_KEY.has(manifest.flag)) {
    problems.push(`References unregistered feature flag '${manifest.flag}'.`);
  }

  for (const route of manifest.routes ?? []) {
    if (!route.path.startsWith('/')) problems.push(`Route '${route.path}' must be absolute.`);
    for (const permission of route.permissions) {
      if (!isKnownPermission(permission)) {
        problems.push(`Route '${route.path}' requires unregistered permission '${permission}'.`);
      }
    }
  }

  for (const api of manifest.apis ?? []) {
    if (!api.path.startsWith('/api/')) {
      problems.push(`API '${api.path}' must be namespaced under /api/.`);
    }
    // Mirrors the API registry rule: a permission that cannot be evaluated
    // against a principal would always deny.
    for (const permission of api.permissions) {
      if (!isKnownPermission(permission)) {
        problems.push(`API '${api.path}' requires unregistered permission '${permission}'.`);
      }
    }
  }

  for (const key of manifest.config ?? []) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      problems.push(`Config key '${key}' is not SCREAMING_SNAKE_CASE.`);
    }
  }

  return problems;
}

/**
 * Order plugins so every dependency loads before its dependents.
 *
 * Topological sort. A cycle throws rather than picking an arbitrary order: with
 * a cycle, at least one plugin's `setup` runs before something it needs, and
 * the resulting failure appears somewhere unrelated to the actual mistake.
 */
export function resolveLoadOrder(manifests: readonly PluginManifest[]): PluginManifest[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const ordered: PluginManifest[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string, path: readonly string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      throw new AppError(
        ERROR_CODES.INTERNAL,
        `Plugin dependency cycle: ${[...path, id].join(' → ')}.`,
        { expose: false },
      );
    }

    const manifest = byId.get(id);
    if (!manifest) {
      throw new AppError(ERROR_CODES.INTERNAL, `Plugin '${id}' depends on a plugin that is not registered.`, {
        expose: false,
      });
    }

    state.set(id, 'visiting');
    for (const dependency of manifest.dependsOn ?? []) visit(dependency, [...path, id]);
    state.set(id, 'done');
    ordered.push(manifest);
  };

  for (const manifest of manifests) visit(manifest.id, []);
  return ordered;
}

/**
 * Load plugins.
 *
 * Every manifest is validated before any `setup` runs, so a partially loaded
 * system is never left behind by a bad manifest discovered halfway through.
 */
export async function loadPlugins(manifests: readonly PluginManifest[]): Promise<void> {
  const allProblems: string[] = [];
  for (const manifest of manifests) {
    const problems = validateManifest(manifest);
    if (problems.length > 0) {
      allProblems.push(`${manifest.id}:\n  - ${problems.join('\n  - ')}`);
    }
  }
  if (allProblems.length > 0) {
    throw new AppError(
      ERROR_CODES.INTERNAL,
      `Plugin validation failed:\n${allProblems.join('\n')}`,
      { expose: false },
    );
  }

  for (const manifest of resolveLoadOrder(manifests)) {
    if (loaded.has(manifest.id)) continue;

    const pluginLogger = logger.child({ plugin: manifest.id, version: manifest.version });
    await manifest.setup?.({ pluginId: manifest.id, logger: pluginLogger });

    loaded.set(manifest.id, { manifest, loadedAt: new Date() });
    pluginLogger.info('Plugin loaded');
  }
}

/** Unload in reverse order, so a dependent tears down before its dependency. */
export async function unloadPlugins(): Promise<void> {
  for (const { manifest } of [...loaded.values()].reverse()) {
    try {
      await manifest.teardown?.();
    } catch (error) {
      logger.error('Plugin teardown failed', { plugin: manifest.id, error });
    }
  }
  loaded.clear();
}

export function loadedPlugins(): readonly PluginManifest[] {
  return [...loaded.values()].map((p) => p.manifest);
}

export function isPluginLoaded(id: string): boolean {
  return loaded.has(id);
}
