/**
 * TL-API-REGISTRY-001 — GET /api/v1/registry
 *
 * Read-only introspection over the architecture registry.
 *
 * Its purpose is to make the architecture *checkable at runtime* rather than
 * only in source: the admin console, deployment verification and integration
 * tests can all ask the running system what it believes it contains. A
 * discrepancy between this response and the documentation is a defect, and
 * having an endpoint makes that discrepancy detectable.
 *
 * Gated by both the `tl.admin.registry.read` permission and the
 * `registry_introspection_api` flag — the flag decides whether the capability
 * exists at all, the permission decides who may use it. Neither substitutes for
 * the other.
 */

import {
  APIS,
  COMPONENTS,
  DIVISIONS,
  ENTITIES,
  EVENTS,
  FEATURE_FLAGS,
  INTEGRATIONS,
  MODULES,
  NOTIFICATIONS,
  PAGES,
  PERMISSIONS,
  PLUGINS,
  ROLES,
  TEST_SUITES,
  TOOLS,
  registrySummary,
} from '@/registry';
import { allFlagStates } from '@/platform/flags';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-REGISTRY-001',
  permissions: ['tl.admin.registry.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  flag: 'registry_introspection_api',
  // A privileged read of the architecture is worth recording (Constitution §9).
  audit: true,
  handler: () => ({
    summary: registrySummary(),
    divisions: DIVISIONS,
    modules: MODULES,
    plugins: PLUGINS,
    tools: TOOLS,
    pages: PAGES,
    components: COMPONENTS,
    apis: APIS,
    entities: ENTITIES,
    permissions: PERMISSIONS,
    roles: ROLES,
    integrations: INTEGRATIONS,
    events: EVENTS,
    notifications: NOTIFICATIONS,
    featureFlags: FEATURE_FLAGS,
    // Resolved runtime state, not just the declared defaults — the useful
    // answer to "is this on right now?".
    flagStates: allFlagStates(),
    testSuites: TEST_SUITES,
  }),
});
