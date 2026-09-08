/**
 * TOOTHLOGY REGISTRY INTEGRITY VALIDATOR
 *
 * The registries describe the architecture. This file is what stops that
 * description from drifting into fiction.
 *
 * Documentation rots because nothing fails when it becomes wrong. A registry
 * that is *validated in CI* cannot rot the same way: a module pointing at a
 * deleted division, a role inheriting from a role that no longer exists, or a
 * duplicated ID all fail a test rather than sitting unnoticed until someone
 * relies on them.
 *
 * `validateRegistry()` returns every problem it finds rather than throwing on
 * the first, because when a registry edit goes wrong it usually goes wrong in
 * several places at once, and fixing them one failed run at a time is miserable.
 */

import { APIS, MUTATING_METHODS } from './apis';
import { DIVISIONS } from './divisions';
import { ENTITIES } from './entities';
import { EVENTS, NOTIFICATIONS } from './events';
import { CONFIG_ENTRIES, FEATURE_FLAGS } from './flags';
import { COUNTRIES, CURRENCIES, LANGUAGES, TIMEZONES } from './globalization';
import { INTEGRATIONS } from './integrations';
import { MODULES } from './modules';
import { PERMISSIONS } from './permissions';
import { PLUGINS } from './plugins';
import { ROLES } from './roles';
import { COMPONENTS, PAGES } from './surfaces';
import { CERTIFICATIONS, TEST_SUITES } from './tests';
import { TOOLS } from './tools';

export interface ValidationIssue {
  /** Which registry the problem is in. */
  readonly registry: string;
  /** The offending object's ID or key, where one exists. */
  readonly subject: string;
  readonly message: string;
}

/** ID grammar. See docs/architecture/ID-SCHEME.md. */
const ID_PATTERN = /^TL-[A-Z0-9]+(-[A-Z0-9]+)*-\d{3}$/;
/** Divisions use a numeric segment instead of a trailing counter. */
const DIVISION_ID_PATTERN = /^TL-DIV-\d{2}-[A-Z]+$/;
/** Permission keys: tl.<division>.<resource>.<action>[.<qualifier>] */
const PERMISSION_KEY_PATTERN = /^tl(\.[a-z0-9_]+){3,4}$/;
/** Event names are SCREAMING_SNAKE_CASE past-tense facts. */
const EVENT_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function validateRegistry(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (registry: string, subject: string, message: string) =>
    issues.push({ registry, subject, message });

  // -- 1. Global ID uniqueness ---------------------------------------------
  // IDs are never reused (Constitution P6), including across registries: a
  // duplicate would make an audit trail or a certification record ambiguous.
  const seenIds = new Map<string, string>();
  const claimId = (registry: string, id: string) => {
    const prior = seenIds.get(id);
    if (prior) {
      add(registry, id, `Duplicate ID — already used in ${prior}. IDs are never reused.`);
      return;
    }
    seenIds.set(id, registry);
  };

  for (const d of DIVISIONS) claimId('divisions', d.id);
  for (const m of MODULES) claimId('modules', m.id);
  for (const p of PLUGINS) claimId('plugins', p.id);
  for (const t of TOOLS) claimId('tools', t.id);
  for (const p of PAGES) claimId('pages', p.id);
  for (const c of COMPONENTS) claimId('components', c.id);
  for (const a of APIS) claimId('apis', a.id);
  for (const e of ENTITIES) claimId('entities', e.id);
  for (const r of ROLES) claimId('roles', r.id);
  for (const i of INTEGRATIONS) claimId('integrations', i.id);
  for (const e of EVENTS) claimId('events', e.id);
  for (const n of NOTIFICATIONS) claimId('notifications', n.id);
  for (const t of TEST_SUITES) claimId('tests', t.id);
  for (const f of FEATURE_FLAGS) claimId('flags', f.id);
  for (const c of CERTIFICATIONS) claimId('certifications', c.id);

  // -- 2. ID grammar --------------------------------------------------------
  for (const d of DIVISIONS) {
    if (!DIVISION_ID_PATTERN.test(d.id)) {
      add('divisions', d.id, 'Division ID must match TL-DIV-<NN>-<SLUG>.');
    }
    if (!d.id.includes(`-${d.number}-`)) {
      add('divisions', d.id, `ID does not contain its own division number '${d.number}'.`);
    }
  }
  const grammarChecked: ReadonlyArray<readonly [string, readonly { id: string }[]]> = [
    ['modules', MODULES],
    ['tools', TOOLS],
    ['pages', PAGES],
    ['components', COMPONENTS],
    ['apis', APIS],
    ['entities', ENTITIES],
    ['roles', ROLES],
    ['integrations', INTEGRATIONS],
    ['events', EVENTS],
    ['notifications', NOTIFICATIONS],
    ['tests', TEST_SUITES],
    ['flags', FEATURE_FLAGS],
    ['certifications', CERTIFICATIONS],
    ['plugins', PLUGINS],
  ];
  for (const [registry, items] of grammarChecked) {
    for (const item of items) {
      if (!ID_PATTERN.test(item.id)) {
        add(registry, item.id, 'ID must match TL-<SEGMENTS>-<NNN> in uppercase.');
      }
    }
  }

  // -- 3. Division references and dependency acyclicity ---------------------
  const divisionIds = new Set(DIVISIONS.map((d) => d.id));
  const divisionNumbers = new Set<string>();
  for (const d of DIVISIONS) {
    if (divisionNumbers.has(d.number)) {
      add('divisions', d.id, `Division number ${d.number} is used more than once.`);
    }
    divisionNumbers.add(d.number);
    for (const dep of d.dependsOn) {
      if (!divisionIds.has(dep)) add('divisions', d.id, `dependsOn unknown division '${dep}'.`);
    }
    if (d.dependsOn.includes(d.id)) add('divisions', d.id, 'Division depends on itself.');
  }
  for (const cycle of findCycles(DIVISIONS.map((d) => [d.id, d.dependsOn]))) {
    add('divisions', cycle[0] ?? '?', `Dependency cycle: ${cycle.join(' → ')}.`);
  }

  // -- 4. Modules -----------------------------------------------------------
  const moduleIds = new Set(MODULES.map((m) => m.id));
  for (const m of MODULES) {
    if (!divisionIds.has(m.divisionId)) {
      add('modules', m.id, `References unknown division '${m.divisionId}'.`);
    }
    // Constitution §2.1 — a module mapping to no pillar does not belong.
    if (m.pillars.length === 0) {
      add('modules', m.id, 'Declares no pillar. Every module must map to at least one.');
    }
    for (const dep of m.dependsOn) {
      if (!moduleIds.has(dep)) add('modules', m.id, `dependsOn unknown module '${dep}'.`);
    }
  }
  for (const cycle of findCycles(MODULES.map((m) => [m.id, m.dependsOn]))) {
    add('modules', cycle[0] ?? '?', `Dependency cycle: ${cycle.join(' → ')}.`);
  }

  // -- 5. Permissions and roles --------------------------------------------
  const permissionKeys = new Set<string>();
  for (const p of PERMISSIONS) {
    if (permissionKeys.has(p.key)) add('permissions', p.key, 'Duplicate permission key.');
    permissionKeys.add(p.key);
    if (!PERMISSION_KEY_PATTERN.test(p.key)) {
      add('permissions', p.key, 'Key must match tl.<division>.<resource>.<action>[.<qualifier>].');
    }
    if (!divisionIds.has(p.divisionId)) {
      add('permissions', p.key, `References unknown division '${p.divisionId}'.`);
    }
  }

  const roleKeys = new Set(ROLES.map((r) => r.key));
  for (const r of ROLES) {
    for (const perm of r.permissions) {
      if (!permissionKeys.has(perm)) {
        add('roles', r.key, `Grants unknown permission '${perm}'.`);
      }
    }
    for (const parent of r.inherits) {
      if (!roleKeys.has(parent)) add('roles', r.key, `Inherits unknown role '${parent}'.`);
    }
    if (r.inherits.includes(r.key)) add('roles', r.key, 'Role inherits from itself.');
  }
  for (const cycle of findCycles(ROLES.map((r) => [r.key, r.inherits]))) {
    add('roles', cycle[0] ?? '?', `Inheritance cycle: ${cycle.join(' → ')}.`);
  }

  // -- 6. APIs --------------------------------------------------------------
  const eventNames = new Set(EVENTS.map((e) => e.event));
  const apiRoutes = new Set<string>();
  for (const a of APIS) {
    const routeKey = `${a.method} ${a.path}`;
    if (apiRoutes.has(routeKey)) add('apis', a.id, `Duplicate route '${routeKey}'.`);
    apiRoutes.add(routeKey);

    if (!moduleIds.has(a.moduleId)) {
      add('apis', a.id, `References unknown module '${a.moduleId}'.`);
    }
    for (const perm of a.permissions) {
      if (!permissionKeys.has(perm)) add('apis', a.id, `Requires unknown permission '${perm}'.`);
    }
    for (const ev of a.emits) {
      if (!eventNames.has(ev)) add('apis', a.id, `Emits unregistered event '${ev}'.`);
    }
    if (!a.path.startsWith(`/api/${a.version}/`)) {
      add('apis', a.id, `Path must be namespaced under /api/${a.version}/.`);
    }
    // An endpoint requiring a permission but not authentication cannot resolve
    // a principal to evaluate that permission against — it would always deny.
    if (a.permissions.length > 0 && !a.authRequired) {
      add('apis', a.id, 'Requires permissions but does not require authentication.');
    }
    // Mutations must be replay-safe: a retried booking or charge must not
    // double. Where that is genuinely impossible, the exemption must say why —
    // so "considered and justified" is distinguishable from "forgotten".
    if (MUTATING_METHODS.has(a.method) && !a.idempotent && !a.idempotencyExemption) {
      add(
        'apis',
        a.id,
        'Mutating endpoint is not idempotent and gives no idempotencyExemption reason.',
      );
    }
    if (a.idempotent && a.idempotencyExemption) {
      add('apis', a.id, 'Declares an idempotency exemption while also being idempotent.');
    }
  }

  // -- 7. Pages -------------------------------------------------------------
  const certificationIds = new Set(CERTIFICATIONS.map((c) => c.id));
  const routes = new Set<string>();
  for (const p of PAGES) {
    if (routes.has(p.route)) add('pages', p.id, `Duplicate route '${p.route}'.`);
    routes.add(p.route);
    if (!moduleIds.has(p.moduleId)) {
      add('pages', p.id, `References unknown module '${p.moduleId}'.`);
    }
    for (const perm of p.permissions) {
      if (!permissionKeys.has(perm)) add('pages', p.id, `Requires unknown permission '${perm}'.`);
    }
    if (p.certificationId && !certificationIds.has(p.certificationId)) {
      add('pages', p.id, `References unknown certification '${p.certificationId}'.`);
    }
    // A page requiring permissions must not be open to anonymous visitors, and
    // an indexable page must be reachable without one.
    if (p.permissions.length > 0 && p.audience === 'anonymous') {
      add('pages', p.id, 'Anonymous page requires permissions — it could never render.');
    }
    if (p.indexable && p.audience !== 'anonymous') {
      add('pages', p.id, 'Marked indexable but not reachable anonymously.');
    }
  }

  // -- 8. Entities ----------------------------------------------------------
  for (const e of ENTITIES) {
    if (!divisionIds.has(e.divisionId)) {
      add('entities', e.id, `References unknown division '${e.divisionId}'.`);
    }
    // PHI must always be audited — that is the whole point of the classification.
    if (e.sensitivity === 'phi' && !e.audited) {
      add('entities', e.id, 'PHI-classified entity is not audited.');
    }
  }

  // -- 9. Events and notifications -----------------------------------------
  const notificationIds = new Set(NOTIFICATIONS.map((n) => n.id));
  for (const e of EVENTS) {
    if (!EVENT_NAME_PATTERN.test(e.event)) {
      add('events', e.id, `Event name '${e.event}' must be SCREAMING_SNAKE_CASE.`);
    }
    if (!divisionIds.has(e.divisionId)) {
      add('events', e.id, `References unknown division '${e.divisionId}'.`);
    }
    for (const n of e.notifies) {
      if (!notificationIds.has(n)) add('events', e.id, `Triggers unknown notification '${n}'.`);
    }
  }
  for (const n of NOTIFICATIONS) {
    if (!divisionIds.has(n.divisionId)) {
      add('notifications', n.id, `References unknown division '${n.divisionId}'.`);
    }
    if (n.channels.length === 0) add('notifications', n.id, 'Declares no delivery channel.');
  }

  // -- 10. Integrations and configuration ----------------------------------
  const configKeys = new Set(CONFIG_ENTRIES.map((c) => c.key));
  for (const i of INTEGRATIONS) {
    if (i.envVars.length === 0) {
      add('integrations', i.id, 'Declares no environment variables; it cannot be configured.');
    }
    for (const v of i.envVars) {
      if (!/^[A-Z][A-Z0-9_]*$/.test(v)) {
        add('integrations', i.id, `Env var '${v}' is not SCREAMING_SNAKE_CASE.`);
      }
    }
  }
  for (const c of CONFIG_ENTRIES) {
    // The check that stops a secret from being bundled into client JavaScript.
    if (c.scope === 'public' && !c.key.startsWith('NEXT_PUBLIC_')) {
      add('config', c.key, "Public-scope config must be prefixed NEXT_PUBLIC_.");
    }
    if (c.scope === 'public' && c.secret) {
      add('config', c.key, 'Config cannot be both public and secret.');
    }
    if (c.required && c.defaultValue !== null) {
      add('config', c.key, 'Required config must not carry a default.');
    }
  }

  // -- 11. Feature flags ----------------------------------------------------
  const flagKeys = new Set<string>();
  for (const f of FEATURE_FLAGS) {
    if (flagKeys.has(f.key)) add('flags', f.key, 'Duplicate flag key.');
    flagKeys.add(f.key);
    if (!divisionIds.has(f.divisionId)) {
      add('flags', f.id, `References unknown division '${f.divisionId}'.`);
    }
    if (!/^[a-z][a-z0-9_]*$/.test(f.key)) {
      add('flags', f.id, `Flag key '${f.key}' must be lower_snake_case.`);
    }
  }
  void configKeys;

  // -- 12. Plugins ----------------------------------------------------------
  const pluginIds = new Set(PLUGINS.map((p) => p.id));
  for (const p of PLUGINS) {
    if (!divisionIds.has(p.divisionId)) {
      add('plugins', p.id, `References unknown division '${p.divisionId}'.`);
    }
    for (const dep of p.dependsOn) {
      if (!pluginIds.has(dep)) add('plugins', p.id, `dependsOn unknown plugin '${dep}'.`);
    }
    for (const perm of p.permissions) {
      if (!permissionKeys.has(perm)) add('plugins', p.id, `Declares unknown permission '${perm}'.`);
    }
    if (p.flagId && !FEATURE_FLAGS.some((f) => f.id === p.flagId)) {
      add('plugins', p.id, `References unknown feature flag '${p.flagId}'.`);
    }
  }

  // -- 13. Tests and certifications ----------------------------------------
  const allIds = new Set(seenIds.keys());
  for (const t of TEST_SUITES) {
    for (const covered of t.covers) {
      if (!allIds.has(covered)) add('tests', t.id, `Covers unknown registry object '${covered}'.`);
    }
    if (t.dimensions.length === 0) {
      add('tests', t.id, 'Declares no certification dimension; its evidence means nothing.');
    }
  }
  const pageAndModuleIds = new Set<string>([...moduleIds, ...PAGES.map((p) => p.id)]);
  for (const c of CERTIFICATIONS) {
    if (!pageAndModuleIds.has(c.subjectId)) {
      add('certifications', c.id, `Certifies unknown page or module '${c.subjectId}'.`);
    }
    if (c.status === 'certified' && c.certifiedAt === null) {
      add('certifications', c.id, 'Marked certified with no certification date.');
    }
    // Certification requires evidence across all 21 dimensions (Constitution §7).
    if (c.status === 'certified' && c.dimensionsPassed.length < 21) {
      add(
        'certifications',
        c.id,
        `Marked certified with only ${c.dimensionsPassed.length}/21 dimensions passed.`,
      );
    }
  }

  // -- 14. Globalization reference data ------------------------------------
  const currencyCodes = new Set(CURRENCIES.map((c) => c.code));
  const languageCodes = new Set(LANGUAGES.map((l) => l.code));
  const timezoneIds = new Set(TIMEZONES.map((t) => t.id));
  const countryCodes = new Set(COUNTRIES.map((c) => c.code));

  for (const c of COUNTRIES) {
    if (!/^[A-Z]{2}$/.test(c.code)) add('countries', c.code, 'Not an ISO 3166-1 alpha-2 code.');
    if (!currencyCodes.has(c.defaultCurrency)) {
      add('countries', c.code, `Default currency '${c.defaultCurrency}' is not registered.`);
    }
    if (!languageCodes.has(c.defaultLocale)) {
      add('countries', c.code, `Default locale '${c.defaultLocale}' is not registered.`);
    }
    if (!timezoneIds.has(c.defaultTimezone)) {
      add('countries', c.code, `Default timezone '${c.defaultTimezone}' is not registered.`);
    }
    if (!/^\+\d{1,4}$/.test(c.callingCode)) {
      add('countries', c.code, `Calling code '${c.callingCode}' is malformed.`);
    }
  }
  for (const c of CURRENCIES) {
    if (!/^[A-Z]{3}$/.test(c.code)) add('currencies', c.code, 'Not an ISO 4217 code.');
    if (c.minorUnits < 0 || c.minorUnits > 4 || !Number.isInteger(c.minorUnits)) {
      add('currencies', c.code, `minorUnits ${c.minorUnits} is out of range.`);
    }
  }
  for (const t of TIMEZONES) {
    if (!countryCodes.has(t.countryCode)) {
      add('timezones', t.id, `References unknown country '${t.countryCode}'.`);
    }
    if (!t.id.includes('/')) add('timezones', t.id, 'Not an IANA identifier.');
  }
  // An enabled country whose defaults point at disabled reference data would
  // break at runtime for every user in that market.
  for (const c of COUNTRIES.filter((x) => x.enabled)) {
    if (!CURRENCIES.find((x) => x.code === c.defaultCurrency)?.enabled) {
      add('countries', c.code, 'Enabled country whose default currency is disabled.');
    }
    if (!LANGUAGES.find((x) => x.code === c.defaultLocale)?.enabled) {
      add('countries', c.code, 'Enabled country whose default locale is disabled.');
    }
  }

  return issues;
}

/**
 * Find dependency cycles via depth-first search.
 *
 * Returns each cycle as the path that closes it, so the error message names the
 * actual loop rather than merely asserting one exists.
 */
function findCycles(edges: ReadonlyArray<readonly [string, readonly string[]]>): string[][] {
  const graph = new Map(edges);
  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string) => {
    const s = state.get(node);
    if (s === 'done') return;
    if (s === 'visiting') {
      const start = stack.indexOf(node);
      if (start !== -1) cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (graph.has(next)) visit(next);
    }
    stack.pop();
    state.set(node, 'done');
  };

  for (const [node] of edges) visit(node);
  return cycles;
}

/** Throwing wrapper for use at boot or in scripts. */
export function assertRegistryValid(): void {
  const issues = validateRegistry();
  if (issues.length > 0) {
    const detail = issues.map((i) => `  [${i.registry}] ${i.subject}: ${i.message}`).join('\n');
    throw new Error(`Toothlogy registry integrity failed (${issues.length} issue(s)):\n${detail}`);
  }
}
