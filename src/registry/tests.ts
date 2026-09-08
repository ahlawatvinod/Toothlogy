/**
 * TOOTHLOGY TEST & CERTIFICATION REGISTRY
 *
 * `TEST_SUITES` records what each suite proves and which registry objects it
 * provides evidence for. `covers` is the link that turns a passing test run into
 * certification evidence instead of a green tick with no stated meaning.
 *
 * `CERTIFICATIONS` records the certification state of pages and modules
 * (Constitution §7). Every entry is honestly `uncertified` in Phase 0: the
 * certification standard becomes binding from Prompt 3, and claiming a
 * certification that has not happened is the single worst process violation
 * available here (Constitution P9).
 *
 * A suite listed here must exist on disk. The registry integrity test asserts
 * that, so this file cannot quietly describe tests nobody wrote.
 */

import type { Certification, TestSuite } from './types';

export const TEST_SUITES: readonly TestSuite[] = [
  {
    id: 'TL-TEST-REGISTRY-001',
    name: 'Registry integrity',
    description:
      'Asserts the architecture itself: unique IDs, no dangling cross-references, no dependency cycles, every module mapped to a pillar, every declared test file present.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/registry/registry-integrity.test.ts',
    covers: ['TL-CORE-KERNEL-001'],
    dimensions: ['FUNCTIONAL', 'REGRESSION'],
  },
  {
    id: 'TL-TEST-MONEY-001',
    name: 'Money arithmetic',
    description:
      'Minor-unit arithmetic, zero-decimal currencies, currency-mismatch rejection, and allocation that distributes remainders without losing or inventing a unit.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/platform/money.test.ts',
    covers: ['TL-CORE-MONEY-001', 'TL-TOOL-CURRENCY-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-RBAC-001',
    name: 'Authorization',
    description:
      'Default deny, transitive role inheritance, scope handling, and the guarantee that an anonymous principal receives no permission at all.',
    status: 'implemented',
    phase: 0,
    level: 'security',
    path: 'tests/platform/rbac.test.ts',
    covers: ['TL-CORE-RBAC-001'],
    dimensions: ['AUTH', 'PERMISSIONS', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-HTTP-001',
    name: 'API envelope and errors',
    description:
      'Response envelope shape, error-code to HTTP-status mapping, request-ID propagation, and that internal error detail never reaches a client.',
    status: 'implemented',
    phase: 0,
    level: 'api',
    path: 'tests/platform/http.test.ts',
    covers: ['TL-CORE-HTTP-001', 'TL-CORE-KERNEL-001'],
    dimensions: ['API', 'ERROR_STATES', 'SECURITY'],
  },
  {
    id: 'TL-TEST-LOGGING-001',
    name: 'Log redaction',
    description:
      'Proves secrets, tokens, passwords and PHI-classified fields are redacted before a log line is emitted, including when nested inside objects.',
    status: 'implemented',
    phase: 0,
    level: 'security',
    path: 'tests/platform/logging.test.ts',
    covers: ['TL-CORE-OBSERVABILITY-001'],
    dimensions: ['SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-I18N-001',
    name: 'Internationalization',
    description:
      'Locale negotiation and fallback, RTL detection, message interpolation, and locale-aware date and number formatting.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/platform/i18n.test.ts',
    covers: ['TL-CORE-I18N-001', 'TL-TOOL-TRANSLATION-001'],
    dimensions: ['FUNCTIONAL', 'UI_UX', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-LOCATION-001',
    name: 'Location and geofencing',
    description:
      'Haversine distance against known city pairs, bounding-box radius maths, and geofence containment for radius and polygon shapes including the antimeridian case.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/platform/location.test.ts',
    covers: ['TL-LOCATION-GEO-001', 'TL-TOOL-GEOFENCE-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-EVENTS-001',
    name: 'Event bus',
    description:
      'Registered-name enforcement, subscriber isolation (one failing subscriber does not stop the others), and that unregistered event names are rejected.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/platform/events.test.ts',
    covers: ['TL-CORE-EVENTS-001'],
    dimensions: ['FUNCTIONAL', 'NOTIFICATIONS', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-FLAGS-001',
    name: 'Feature flags',
    description:
      'Per-environment defaults, environment-variable override precedence, and that an unknown flag key resolves to disabled rather than throwing or defaulting on.',
    status: 'implemented',
    phase: 0,
    level: 'unit',
    path: 'tests/platform/flags.test.ts',
    covers: ['TL-CORE-FLAGS-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-AUTH-001',
    name: 'Password and OTP',
    description:
      'scrypt hashing round-trip, salt uniqueness for identical passwords, timing-safe verification, and OTP expiry and attempt limits.',
    status: 'implemented',
    phase: 0,
    level: 'security',
    path: 'tests/platform/auth.test.ts',
    covers: ['TL-CORE-AUTH-001', 'TL-TOOL-OTP-001'],
    dimensions: ['AUTH', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-PROVIDERS-001',
    name: 'Unconfigured provider behaviour',
    description:
      'Proves every unconfigured integration port returns a typed NOT_CONFIGURED error and never a fabricated success (Constitution P10). The test that keeps a fake "payment succeeded" out of the codebase.',
    status: 'implemented',
    phase: 0,
    level: 'integration',
    path: 'tests/platform/providers.test.ts',
    covers: [
      'TL-INTEGRATIONS-PORTS-001',
      'TL-PAYMENTS-GATEWAY-001',
      'TL-CORE-NOTIFICATIONS-001',
      'TL-CORE-STORAGE-001',
      'TL-CORE-SEARCH-001',
    ],
    dimensions: ['INTEGRATIONS', 'PAYMENT', 'NOTIFICATIONS', 'ERROR_STATES'],
  },
  {
    id: 'TL-TEST-SECRETS-001',
    name: 'Secret scanning',
    description:
      'Scans tracked source for committed credentials, private keys and connection strings. A standing guard on Constitution §9, not a one-time check.',
    status: 'implemented',
    phase: 0,
    level: 'security',
    path: 'tests/security/secrets.test.ts',
    covers: ['TL-CORE-CONFIG-001'],
    dimensions: ['SECURITY', 'REGRESSION'],
  },
  {
    id: 'TL-TEST-DESIGNSYSTEM-001',
    name: 'Design system components',
    description:
      'Renders every primitive and asserts its accessibility contract: label association, error announcement, ARIA roles, and that no state is conveyed by colour alone.',
    status: 'implemented',
    phase: 0,
    level: 'accessibility',
    path: 'tests/design-system/components.test.tsx',
    covers: ['TL-EXPERIENCE-DESIGNSYSTEM-001'],
    dimensions: ['UI_UX', 'ACCESSIBILITY', 'LOADING_STATES', 'EMPTY_STATES', 'ERROR_STATES'],
  },
] as const;

export const TEST_SUITE_BY_ID: ReadonlyMap<string, TestSuite> = new Map(
  TEST_SUITES.map((t) => [t.id, t]),
);

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

/**
 * Certification IDs use the founding specification's grammar: `TL-<AREA>-<NAME>-<NNN>`
 * (for example `TL-FE-HOME-001`). See `docs/architecture/ID-SCHEME.md`.
 *
 * Every entry is `uncertified`. Phase 0 delivers the standard and the machinery;
 * it certifies nothing, because certification requires evidence across all 21
 * dimensions plus competitive benchmarking, and that work begins at Prompt 3.
 */
export const CERTIFICATIONS: readonly Certification[] = [
  {
    id: 'TL-FE-HOME-001',
    subjectId: 'TL-PAGE-HOME-001',
    status: 'uncertified',
    dimensionsPassed: [],
    benchmarks: [],
    certifiedAt: null,
  },
  {
    id: 'TL-FE-DESIGNSYSTEM-001',
    subjectId: 'TL-PAGE-DESIGNSYSTEM-001',
    status: 'uncertified',
    dimensionsPassed: [],
    benchmarks: [],
    certifiedAt: null,
  },
] as const;

export const CERTIFICATION_BY_ID: ReadonlyMap<string, Certification> = new Map(
  CERTIFICATIONS.map((c) => [c.id, c]),
);
