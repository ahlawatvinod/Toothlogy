/**
 * TOOTHLOGY PLUGIN REGISTRY
 *
 * A PLUGIN is an optional, independently loadable extension (Constitution §6,
 * founding spec §23). Plugins exist so that future Toothlogy capabilities —
 * a country-specific compliance pack, a partner integration, an experimental
 * discovery ranker — can be added without editing the core.
 *
 * **No plugins are registered.** Phase 0 delivers the plugin *kernel*
 * (`src/plugins/kernel.ts`) — the manifest contract, dependency resolution and
 * load ordering — and nothing else. Registering a plugin that does not exist
 * would be exactly the kind of decorative progress Constitution P9 forbids.
 *
 * The rule that keeps plugins from becoming a second, undisciplined codebase:
 * **a plugin may only declare; it may not reach in.** It declares the
 * permissions, routes, APIs, entities, tools, integrations, events, config and
 * flags it needs, and the kernel wires them. A plugin that imports another
 * plugin's internals directly is uncontrolled coupling and is rejected at load
 * time by the dependency check.
 */

import type { PluginRegistration } from './types';

export const PLUGINS: readonly PluginRegistration[] = [] as const;

export const PLUGIN_BY_ID: ReadonlyMap<string, PluginRegistration> = new Map(
  PLUGINS.map((p) => [p.id, p]),
);
