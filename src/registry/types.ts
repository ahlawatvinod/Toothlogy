/**
 * TOOTHLOGY REGISTRY — TYPE CONTRACTS
 *
 * The registry is the machine-readable form of the Constitution's architecture
 * hierarchy (CONSTITUTION.md §6):
 *
 *   TOOTHLOGY → DIVISION → MODULE → PLUGIN → TOOL → PAGE → COMPONENT
 *             → API → DATABASE → INTEGRATION → PERMISSION → TEST
 *
 * Every registered object carries a stable ID that is assigned once and never
 * reused (Constitution P6). Cross-references between registries are validated at
 * test time by `src/registry/validate.ts`, so a dangling reference fails CI
 * rather than failing in production.
 *
 * Registries describe *architecture*, not *completion*. An entry with
 * `status: 'planned'` documents an intended capability and is not a claim that
 * code exists — see the `LifecycleStatus` docs below.
 */

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

/** The five pillars every feature must map to (Constitution §2). */
export const PILLARS = ['LEARN', 'DISCOVER', 'TRUST', 'CONNECT', 'BOOK'] as const;
export type Pillar = (typeof PILLARS)[number];

/** Implementation phases 0–12 (Constitution §11, docs/architecture/PHASES.md). */
export const PHASES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Honest state reporting (Constitution P9). These map directly onto the
 * ✅ / 🟡 / 🔴 vocabulary used in every status report:
 *
 * - `implemented`  ✅ code exists, is wired up, and is covered by tests
 * - `prepared`     🟡 contract/port/type exists; no working behaviour behind it
 * - `planned`      🔴 registered so the ID is reserved; nothing exists yet
 * - `deprecated`   scheduled for removal; do not build new work on it
 */
export const LIFECYCLE_STATUSES = [
  'implemented',
  'prepared',
  'planned',
  'deprecated',
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/** Feature-flag states (Constitution §10). */
export const FLAG_STATES = [
  'disabled',
  'development',
  'beta',
  'enabled',
  'deprecated',
] as const;
export type FlagState = (typeof FLAG_STATES)[number];

/** Data-sensitivity classification, drives logging/redaction and access rules. */
export const SENSITIVITY_LEVELS = [
  'public', // safe to serve anonymously and index
  'internal', // requires an authenticated principal
  'confidential', // business-sensitive; permission-gated
  'phi', // protected health information; audited, never logged
] as const;
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];

/** Every registered object shares this shape. */
export interface RegistryObject {
  /** Stable unique ID. Assigned once, never reused. See docs/architecture/ID-SCHEME.md. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: LifecycleStatus;
  /** Phase in which this object is expected to be delivered. */
  readonly phase: Phase;
}

// ---------------------------------------------------------------------------
// DIVISION — top-level capability domain (Constitution §6, docs/architecture/DIVISIONS.md)
// ---------------------------------------------------------------------------

export interface Division extends RegistryObject {
  /** Two-digit division number, '01'–'35'. Part of the ID and never renumbered. */
  readonly number: string;
  readonly slug: string;
  readonly pillars: readonly Pillar[];
  /** Divisions this one may depend on. Dependencies must not form a cycle. */
  readonly dependsOn: readonly string[];
  /** Data this division owns and is the sole writer of (Constitution §8). */
  readonly owns: readonly string[];
}

// ---------------------------------------------------------------------------
// MODULE — coherent unit of functionality inside exactly one division
// ---------------------------------------------------------------------------

export interface Module extends RegistryObject {
  /** ID of the owning division. Exactly one — modules are not shared. */
  readonly divisionId: string;
  /** Non-empty: a module that maps to no pillar does not belong (Constitution §2.1). */
  readonly pillars: readonly Pillar[];
  readonly dependsOn: readonly string[];
}

// ---------------------------------------------------------------------------
// PLUGIN — optional, independently loadable extension (Constitution §6, §23)
// ---------------------------------------------------------------------------

export interface PluginRegistration extends RegistryObject {
  readonly version: string;
  readonly divisionId: string;
  readonly dependsOn: readonly string[];
  readonly permissions: readonly string[];
  readonly flagId: string | null;
}

// ---------------------------------------------------------------------------
// TOOL — reusable cross-cutting capability (Constitution §24)
// ---------------------------------------------------------------------------

export interface Tool extends RegistryObject {
  /** Import path of the tool's port/contract, so consumers can find it. */
  readonly module: string;
  /** True when the tool needs an external provider to do anything real. */
  readonly requiresProvider: boolean;
}

// ---------------------------------------------------------------------------
// PAGE — addressable user surface
// ---------------------------------------------------------------------------

export const PAGE_AUDIENCES = [
  'anonymous',
  'authenticated',
  'staff',
  'admin',
] as const;
export type PageAudience = (typeof PAGE_AUDIENCES)[number];

export interface Page extends RegistryObject {
  readonly route: string;
  readonly moduleId: string;
  readonly audience: PageAudience;
  /** Permissions required to render. Empty means public. */
  readonly permissions: readonly string[];
  /** Should search engines index this route? Drives robots/sitemap generation. */
  readonly indexable: boolean;
  /** Certification ID (Constitution §7). Null until certification begins. */
  readonly certificationId: string | null;
}

// ---------------------------------------------------------------------------
// COMPONENT — design-system building block
// ---------------------------------------------------------------------------

export interface ComponentEntry extends RegistryObject {
  readonly module: string;
  /** WAI-ARIA pattern this component implements, when one applies. */
  readonly ariaPattern: string | null;
}

// ---------------------------------------------------------------------------
// API — versioned contract
// ---------------------------------------------------------------------------

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ApiEndpoint extends RegistryObject {
  readonly method: HttpMethod;
  readonly path: string;
  readonly version: string;
  readonly moduleId: string;
  /** Empty array means intentionally public. `null` is not permitted — the
   *  decision to be public must be explicit (Constitution §9, default deny). */
  readonly permissions: readonly string[];
  readonly authRequired: boolean;
  /** Mutating endpoints must declare idempotency support. */
  readonly idempotent: boolean;
  /**
   * Why a mutating endpoint is NOT idempotent.
   *
   * Required when `idempotent` is false on a mutating method, and enforced by
   * the registry integrity test. Some operations genuinely cannot be replayed —
   * logging in mints a new session by definition — and the honest answer is to
   * say so in one reviewable place, not to mark them idempotent falsely.
   *
   * The field exists so "we thought about it and here is why" is distinguishable
   * from "we forgot", which is the same distinction `permissions: []` draws for
   * public routes.
   */
  readonly idempotencyExemption?: string;
  readonly rateLimit: string;
  /** Events this endpoint may emit. Must exist in the event registry. */
  readonly emits: readonly string[];
}

// ---------------------------------------------------------------------------
// ENTITY — persisted domain object
// ---------------------------------------------------------------------------

export interface Entity extends RegistryObject {
  readonly divisionId: string;
  /** Prisma model name, when the entity is materialised in the schema. */
  readonly model: string | null;
  readonly sensitivity: Sensitivity;
  /** Who owns this data (Constitution §8). */
  readonly owner: string;
  readonly softDelete: boolean;
  readonly audited: boolean;
}

// ---------------------------------------------------------------------------
// PERMISSION & ROLE — access control
// ---------------------------------------------------------------------------

export interface Permission {
  /** Dotted key, e.g. `tl.appointment.booking.create`. Stable and never reused. */
  readonly key: string;
  readonly description: string;
  readonly divisionId: string;
  /** Scope at which the permission is evaluated. */
  readonly scope: 'global' | 'organization' | 'self';
  readonly sensitivity: Sensitivity;
}

export interface Role {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  /** Permission keys granted directly. Must all exist in the permission registry. */
  readonly permissions: readonly string[];
  /** Roles whose permissions this role also receives, transitively. */
  readonly inherits: readonly string[];
  readonly assignable: boolean;
}

// ---------------------------------------------------------------------------
// INTEGRATION — external system
// ---------------------------------------------------------------------------

export const INTEGRATION_CATEGORIES = [
  'email',
  'sms',
  'whatsapp',
  'push',
  'payment',
  'video',
  'data',
  'storage',
  'maps',
  'search',
  'analytics',
  'ai',
  'iot',
  'identity',
] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

export interface Integration extends RegistryObject {
  readonly category: IntegrationCategory;
  /** Import path of the port this integration must implement. */
  readonly port: string;
  /** Env var names required to configure it. Names only — never values. */
  readonly envVars: readonly string[];
}

// ---------------------------------------------------------------------------
// EVENT & NOTIFICATION
// ---------------------------------------------------------------------------

export interface EventDefinition extends RegistryObject {
  /** SCREAMING_SNAKE event name, e.g. `APPOINTMENT_CREATED`. */
  readonly event: string;
  readonly divisionId: string;
  readonly payloadSensitivity: Sensitivity;
  /** Notification IDs this event may trigger. */
  readonly notifies: readonly string[];
}

export const NOTIFICATION_CHANNELS = [
  'in_app',
  'push',
  'email',
  'sms',
  'whatsapp',
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Preference category a notification belongs to. Users mute categories per
 * channel ("no SMS for community activity"), which is far more usable than
 * one switch per notification type and far kinder than one switch overall.
 */
export const NOTIFICATION_CATEGORIES = [
  'account',
  'security',
  'appointments',
  'messages',
  'reviews',
  'leads',
  'billing',
  'marketplace',
  'careers',
  'community',
  'marketing',
] as const;
export type NotificationCategoryKey = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationDefinition extends RegistryObject {
  readonly channels: readonly NotificationChannel[];
  /** Transactional notifications ignore marketing opt-out; marketing must not. */
  readonly transactional: boolean;
  readonly divisionId: string;
  readonly category: NotificationCategoryKey;
  /**
   * Delivered through quiet hours. Reserved for things that lose their value
   * if held until morning: a security alert, a cancellation of today's
   * appointment, a one-time code. Everything else waits.
   */
  readonly urgent?: boolean;
}

// ---------------------------------------------------------------------------
// TEST / CERTIFICATION
// ---------------------------------------------------------------------------

/** The 21 certification dimensions (Constitution §7). */
export const CERTIFICATION_DIMENSIONS = [
  'FUNCTIONAL',
  'UI_UX',
  'DESKTOP',
  'MOBILE',
  'RESPONSIVE',
  'ACCESSIBILITY',
  'API',
  'DATABASE',
  'AUTH',
  'PERMISSIONS',
  'SECURITY',
  'PAYMENT',
  'NOTIFICATIONS',
  'PERFORMANCE',
  'SEO',
  'INTEGRATIONS',
  'EMPTY_STATES',
  'LOADING_STATES',
  'ERROR_STATES',
  'EDGE_CASES',
  'REGRESSION',
] as const;
export type CertificationDimension = (typeof CERTIFICATION_DIMENSIONS)[number];

export const TEST_LEVELS = [
  'unit',
  'integration',
  'api',
  'database',
  'security',
  'ui',
  'accessibility',
  'performance',
  'e2e',
] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

export interface TestSuite extends RegistryObject {
  readonly level: TestLevel;
  /** Path to the suite, relative to repo root. */
  readonly path: string;
  /** Registry IDs this suite provides evidence for. */
  readonly covers: readonly string[];
  readonly dimensions: readonly CertificationDimension[];
}

export interface Certification {
  /** Certification ID, e.g. `TL-FE-HOME-001` (Constitution §7). */
  readonly id: string;
  /** Page or module ID being certified. */
  readonly subjectId: string;
  readonly status: 'uncertified' | 'in_progress' | 'certified' | 'revoked';
  /** Dimensions with recorded evidence. Certification requires all 21. */
  readonly dimensionsPassed: readonly CertificationDimension[];
  /** Products benchmarked against (Constitution §7). */
  readonly benchmarks: readonly string[];
  readonly certifiedAt: string | null;
}

// ---------------------------------------------------------------------------
// FEATURE FLAG & CONFIGURATION
// ---------------------------------------------------------------------------

export interface FeatureFlag extends RegistryObject {
  readonly key: string;
  /** Default state per environment. Production defaults to `disabled` for
   *  anything not yet certified (Constitution §10). */
  readonly defaults: {
    readonly development: FlagState;
    readonly test: FlagState;
    readonly production: FlagState;
  };
  readonly divisionId: string;
}

export interface ConfigEntry {
  readonly key: string;
  readonly description: string;
  /** True when the value is a secret and must never be logged or committed. */
  readonly secret: boolean;
  readonly required: boolean;
  readonly scope: 'server' | 'public';
  readonly defaultValue: string | null;
}

// ---------------------------------------------------------------------------
// GLOBALIZATION REFERENCE DATA (Constitution §4)
// ---------------------------------------------------------------------------

export interface Country {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  readonly name: string;
  readonly defaultCurrency: string;
  readonly defaultLocale: string;
  readonly defaultTimezone: string;
  readonly callingCode: string;
  /** Tax regime used by the pricing engine. */
  readonly taxRegime: 'gst' | 'vat' | 'sales_tax' | 'none';
  /** Is this market live for onboarding? */
  readonly enabled: boolean;
}

export interface Language {
  /** BCP 47 tag. */
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
  readonly direction: 'ltr' | 'rtl';
  readonly enabled: boolean;
}

export interface Currency {
  /** ISO 4217. */
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  /** Number of minor units — 2 for INR/USD, 0 for JPY. Money maths depends on this. */
  readonly minorUnits: number;
  readonly enabled: boolean;
}

export interface Timezone {
  /** IANA identifier, e.g. `Asia/Kolkata`. */
  readonly id: string;
  readonly label: string;
  readonly countryCode: string;
}
