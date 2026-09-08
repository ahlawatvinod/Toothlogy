/**
 * TOOTHLOGY FEATURE FLAG & CONFIGURATION REGISTRY
 *
 * Flags exist so unfinished work can be merged without being exposed
 * (Constitution §10). The lifecycle is:
 *
 *     disabled → development → beta → enabled → deprecated
 *
 * The production default for anything uncertified is `disabled`. That is not a
 * suggestion — it is the mechanism that makes "merge early, ship deliberately"
 * safe across twelve phases of parallel work.
 *
 * Resolution order at runtime (see `src/platform/flags`):
 *   1. `TL_FLAG_<KEY>` environment override, when present
 *   2. the registry default for the current environment
 *   3. `disabled`
 *
 * A database-backed override layer (`FeatureFlagOverride`) sits between 1 and 2
 * from Phase 1, so a flag can be turned off in production without a deploy.
 */

import type { ConfigEntry, FeatureFlag } from './types';

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  {
    id: 'TL-FLAG-DESIGNSYSTEM-REF-001',
    key: 'design_system_reference',
    name: 'Design system reference page',
    description:
      'Exposes the /design-system reference route. Internal tooling: on in development, off in production so it is never a public surface.',
    status: 'implemented',
    phase: 2,
    defaults: { development: 'enabled', test: 'enabled', production: 'disabled' },
    divisionId: 'TL-DIV-02-EXPERIENCE',
  },
  {
    id: 'TL-FLAG-REGISTRY-API-001',
    key: 'registry_introspection_api',
    name: 'Registry introspection API',
    description:
      'Enables GET /api/v1/registry. Permission-gated as well as flag-gated: a flag controls whether a capability exists, a permission controls who may use it. Neither substitutes for the other.',
    status: 'implemented',
    phase: 2,
    defaults: { development: 'enabled', test: 'enabled', production: 'beta' },
    divisionId: 'TL-DIV-32-ADMIN',
  },
  {
    id: 'TL-FLAG-VERBOSE-HEALTH-001',
    key: 'verbose_health_check',
    name: 'Verbose health check',
    description:
      'Includes dependency-level detail in the health response for permitted callers. Off by default in production because dependency topology aids an attacker.',
    status: 'implemented',
    phase: 1,
    defaults: { development: 'enabled', test: 'enabled', production: 'disabled' },
    divisionId: 'TL-DIV-35-DEVOPS',
  },
  {
    id: 'TL-FLAG-MULTILOCALE-001',
    key: 'multi_locale_routing',
    name: 'Multi-locale routing',
    description:
      'Serves locale-prefixed routes for every enabled language. Disabled until translated content exists — shipping empty translations reads as a broken product, not a global one.',
    status: 'prepared',
    phase: 2,
    defaults: { development: 'development', test: 'disabled', production: 'disabled' },
    divisionId: 'TL-DIV-02-EXPERIENCE',
  },
] as const;

export const FLAG_BY_KEY: ReadonlyMap<string, FeatureFlag> = new Map(
  FEATURE_FLAGS.map((f) => [f.key, f]),
);

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]['key'];

// ---------------------------------------------------------------------------
// Configuration registry
// ---------------------------------------------------------------------------

/**
 * Every environment variable the platform reads, declared once.
 *
 * - `secret: true` means the value must never be logged, never returned by an
 *   API, and never committed. The logger's redaction list is derived from this
 *   flag, so marking a new secret here automatically protects it in logs.
 * - `scope: 'public'` means the value is safe to send to the browser. Only
 *   `NEXT_PUBLIC_`-prefixed variables may be public, and the config validator
 *   rejects any public entry without that prefix — that check is what stops an
 *   API secret from being bundled into client JavaScript by a careless rename.
 */
export const CONFIG_ENTRIES: readonly ConfigEntry[] = [
  {
    key: 'NODE_ENV',
    description: 'Runtime environment: development, test or production.',
    secret: false,
    required: false,
    scope: 'server',
    defaultValue: 'development',
  },
  {
    key: 'DATABASE_URL',
    description: 'PostgreSQL connection string. Contains credentials.',
    secret: true,
    required: false,
    scope: 'server',
    defaultValue: null,
  },
  {
    key: 'SESSION_SECRET',
    description:
      'Signing key for session tokens. Must be at least 32 characters and unique per environment; rotating it signs everyone out, which is the intended emergency behaviour.',
    secret: true,
    required: false,
    scope: 'server',
    defaultValue: null,
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    description: 'Canonical public origin, used for absolute URLs, SEO metadata and callbacks.',
    secret: false,
    required: false,
    scope: 'public',
    defaultValue: 'http://localhost:3000',
  },
  {
    key: 'NEXT_PUBLIC_DEFAULT_COUNTRY',
    description: 'ISO 3166-1 alpha-2 default country for anonymous visitors before detection.',
    secret: false,
    required: false,
    scope: 'public',
    defaultValue: 'IN',
  },
  {
    key: 'NEXT_PUBLIC_DEFAULT_LOCALE',
    description: 'BCP 47 default locale for anonymous visitors.',
    secret: false,
    required: false,
    scope: 'public',
    defaultValue: 'en',
  },
  {
    key: 'LOG_LEVEL',
    description: 'Minimum log level: debug, info, warn or error.',
    secret: false,
    required: false,
    scope: 'server',
    defaultValue: 'info',
  },
] as const;

export const CONFIG_BY_KEY: ReadonlyMap<string, ConfigEntry> = new Map(
  CONFIG_ENTRIES.map((c) => [c.key, c]),
);

/** Keys whose values must never be logged. Consumed by the logger's redactor. */
export const SECRET_CONFIG_KEYS: readonly string[] = CONFIG_ENTRIES.filter((c) => c.secret).map(
  (c) => c.key,
);
