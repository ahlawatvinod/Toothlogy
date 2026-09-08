/**
 * TOOTHLOGY REGISTRY — public entry point
 *
 * The machine-readable form of the architecture hierarchy (Constitution §6).
 * Import from `@/registry`; do not deep-import individual registry files from
 * outside this folder, so the surface stays reviewable.
 */

export * from './types';
export * from './divisions';
export * from './modules';
export * from './plugins';
export * from './tools';
export * from './surfaces';
export * from './apis';
export * from './entities';
export * from './permissions';
export * from './roles';
export * from './integrations';
export * from './events';
export * from './flags';
export * from './tests';
export * from './globalization';
export * from './validate';

import { APIS } from './apis';
import { DIVISIONS } from './divisions';
import { ENTITIES } from './entities';
import { EVENTS, NOTIFICATIONS } from './events';
import { FEATURE_FLAGS } from './flags';
import { INTEGRATIONS } from './integrations';
import { MODULES } from './modules';
import { PERMISSIONS } from './permissions';
import { PLUGINS } from './plugins';
import { ROLES } from './roles';
import { COMPONENTS, PAGES } from './surfaces';
import { TEST_SUITES } from './tests';
import { TOOLS } from './tools';
import type { LifecycleStatus, Phase } from './types';

/**
 * The highest phase whose work has actually been delivered.
 *
 * This is the single honest statement of build progress, and it is enforced:
 * `tests/registry/registry-integrity.test.ts` fails if any module is marked
 * `implemented` for a later phase. Raising this number is therefore a
 * deliberate claim that the phase is genuinely done, not a side effect of
 * marking one module implemented (Constitution P9).
 *
 * Phase 0 — Constitution and architecture      ✅
 * Phase 1 — Global platform core               ✅ auth, orgs, locations, notifications
 * Phase 2 — Toothlogy experience               ✅ shell, auth UI, account area
 * Phase 3 — Dentist and clinic ecosystem       ✅ profiles, credentials, verification
 * Phase 4+ — not started
 */
export const DELIVERED_THROUGH_PHASE: Phase = 3;

/**
 * A count of what is registered at each lifecycle status, per registry.
 *
 * This exists to make honest reporting cheap (Constitution P9). Any status
 * summary — a report, the admin console, the introspection API — reads these
 * numbers from the registries themselves rather than from a hand-written
 * document that was accurate on the day it was typed.
 */
export function registrySummary() {
  const countByStatus = (items: ReadonlyArray<{ status: LifecycleStatus }>) => {
    const counts: Record<LifecycleStatus, number> = {
      implemented: 0,
      prepared: 0,
      planned: 0,
      deprecated: 0,
    };
    for (const item of items) counts[item.status] += 1;
    return counts;
  };

  return {
    divisions: { total: DIVISIONS.length, ...countByStatus(DIVISIONS) },
    modules: { total: MODULES.length, ...countByStatus(MODULES) },
    plugins: { total: PLUGINS.length, ...countByStatus(PLUGINS) },
    tools: { total: TOOLS.length, ...countByStatus(TOOLS) },
    pages: { total: PAGES.length, ...countByStatus(PAGES) },
    components: { total: COMPONENTS.length, ...countByStatus(COMPONENTS) },
    apis: { total: APIS.length, ...countByStatus(APIS) },
    entities: { total: ENTITIES.length, ...countByStatus(ENTITIES) },
    events: { total: EVENTS.length, ...countByStatus(EVENTS) },
    notifications: { total: NOTIFICATIONS.length, ...countByStatus(NOTIFICATIONS) },
    integrations: { total: INTEGRATIONS.length, ...countByStatus(INTEGRATIONS) },
    featureFlags: { total: FEATURE_FLAGS.length, ...countByStatus(FEATURE_FLAGS) },
    testSuites: { total: TEST_SUITES.length, ...countByStatus(TEST_SUITES) },
    permissions: { total: PERMISSIONS.length },
    roles: { total: ROLES.length },
  };
}
