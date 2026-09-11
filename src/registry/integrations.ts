/**
 * TOOTHLOGY INTEGRATION REGISTRY
 *
 * Every external system Toothlogy may talk to is declared here with the port it
 * must implement and the environment variables that configure it.
 *
 * **`envVars` lists NAMES ONLY — never values.** A secret has never appeared in
 * this repository and never will (Constitution §9). The list exists so that
 * `docs/operations/ENVIRONMENT.md` and the config validator can be generated
 * from one source instead of drifting apart.
 *
 * **No provider is wired in Phase 0.** Every entry below is 🟡 PREPARED: the
 * port exists, the adapter does not. Calling an unconfigured integration returns
 * a typed `NOT_CONFIGURED` error — it never returns a fabricated success
 * (Constitution P10). This is the single most important property of this layer,
 * because a fake "email sent" is indistinguishable from a real one until a
 * patient misses an appointment.
 *
 * Adapters named below are the *intended* providers, chosen for market fit.
 * Naming one is a plan, not an integration.
 */

import type { Integration } from './types';

export const INTEGRATIONS: readonly Integration[] = [
  {
    id: 'TL-INT-EMAIL-001',
    name: 'Transactional Email Provider',
    description:
      'Sends transactional and templated email. Intended adapters: AWS SES or Resend, selected per deployment region.',
    status: 'prepared',
    phase: 1,
    category: 'email',
    port: '@/platform/notifications/ports#EmailPort',
    envVars: ['EMAIL_PROVIDER', 'EMAIL_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME'],
  },
  {
    id: 'TL-INT-SMS-001',
    name: 'SMS Provider',
    description:
      'Sends SMS with per-country sender-ID rules. India requires DLT template registration, which is why template IDs are part of the configuration rather than the message body.',
    status: 'prepared',
    phase: 1,
    category: 'sms',
    port: '@/platform/notifications/ports#SmsPort',
    envVars: ['SMS_PROVIDER', 'SMS_API_KEY', 'SMS_SENDER_ID'],
  },
  {
    id: 'TL-INT-WHATSAPP-001',
    name: 'WhatsApp Business Provider',
    description:
      'Sends WhatsApp messages where legally and technically supported. Template-only outside the 24-hour customer service window — the adapter must enforce that, not the caller.',
    status: 'prepared',
    phase: 5,
    category: 'whatsapp',
    port: '@/platform/notifications/ports#WhatsAppPort',
    envVars: ['WHATSAPP_PROVIDER', 'WHATSAPP_API_KEY', 'WHATSAPP_PHONE_NUMBER_ID'],
  },
  {
    id: 'TL-INT-PUSH-001',
    name: 'Push Notification Provider',
    description: 'Web and mobile push delivery.',
    status: 'prepared',
    phase: 2,
    category: 'push',
    port: '@/platform/notifications/ports#PushPort',
    envVars: ['PUSH_PROVIDER', 'PUSH_API_KEY', 'PUSH_VAPID_PUBLIC_KEY', 'PUSH_VAPID_PRIVATE_KEY'],
  },
  {
    id: 'TL-INT-PAYMENT-001',
    name: 'Payment Gateway',
    description:
      'Payment intents, captures, refunds and webhooks. Intended adapters: Razorpay for India, Stripe for other markets — which is exactly why the port exists rather than a direct SDK dependency.',
    status: 'prepared',
    phase: 4,
    category: 'payment',
    port: '@/platform/payments/ports#PaymentPort',
    envVars: [
      'PAYMENT_PROVIDER',
      'PAYMENT_API_KEY',
      'PAYMENT_API_SECRET',
      'PAYMENT_WEBHOOK_SECRET',
    ],
  },
  {
    id: 'TL-INT-VIDEO-001',
    name: 'Video Consultation Provider',
    description:
      'Creates and cancels the meeting room for a confirmed video appointment (meeting id, participant and host links, expiry). Not configured: video appointments book a time only, no meeting row is written, and no screen shows a link — the clinic sends its own.',
    status: 'prepared',
    phase: 4,
    category: 'video',
    port: '@/platform/video/ports#VideoPort',
    envVars: ['VIDEO_PROVIDER', 'VIDEO_API_KEY', 'VIDEO_API_SECRET'],
  },
  {
    id: 'TL-INT-EXTRACTOR-001',
    name: 'Directory Data Extractor',
    description:
      'Collects dentist, clinic, hospital and college rows for a district from a licensed external source. Not configured: nothing is collected automatically or scraped; operator-supplied files are imported instead.',
    status: 'prepared',
    phase: 5,
    category: 'data',
    port: '@/platform/india-data/extractor-port#ExtractorPort',
    envVars: ['EXTRACTOR_PROVIDER', 'EXTRACTOR_API_KEY'],
  },
  {
    id: 'TL-INT-STORAGE-LOCAL-001',
    name: 'Local Disk Storage',
    description:
      'A real storage adapter that keeps files on the server’s own disk (STORAGE_PROVIDER=local). Single-node only; downloads go through HMAC-signed, expiring URLs served by the application. Suitable for development and single-host deployments, not for a multi-instance cluster.',
    status: 'implemented',
    phase: 1,
    category: 'storage',
    port: '@/platform/storage/ports#StoragePort',
    envVars: ['STORAGE_PROVIDER', 'STORAGE_LOCAL_DIR'],
  },
  {
    id: 'TL-INT-SCANNER-001',
    name: 'Malware Scanner',
    description:
      'Scans every upload before it becomes usable (ClamAV or a cloud AV API). Not configured: uploads are recorded SCANNER_NOT_CONFIGURED — never CLEAN — and FILE_SCAN_REQUIRED decides whether they are quarantined.',
    status: 'prepared',
    phase: 1,
    category: 'storage',
    port: '@/platform/storage/scanner#MalwareScannerPort',
    envVars: ['FILE_SCANNER_PROVIDER', 'FILE_SCANNER_URL'],
  },
  {
    id: 'TL-INT-STORAGE-001',
    name: 'Cloud Object Storage',
    description:
      'Stores uploaded files in S3-compatible object storage with direct signed uploads, for multi-instance deployments. Not implemented yet: the local disk adapter is the only storage adapter.',
    status: 'prepared',
    phase: 1,
    category: 'storage',
    port: '@/platform/storage/ports#StoragePort',
    envVars: [
      'STORAGE_PROVIDER',
      'STORAGE_BUCKET',
      'STORAGE_REGION',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
    ],
  },
  {
    id: 'TL-INT-MAPS-001',
    name: 'Maps & Geocoding Provider',
    description: 'Map tiles, forward and reverse geocoding, and routing.',
    status: 'prepared',
    phase: 4,
    category: 'maps',
    port: '@/platform/location/ports#GeocodingPort',
    envVars: ['MAPS_PROVIDER', 'MAPS_API_KEY'],
  },
  {
    id: 'TL-INT-GEOCODER-REF-001',
    name: 'Reference Geocoder (city level)',
    description:
      'Geocodes place names to city centres, and coordinates to the nearest city, from the seeded gazetteer. Real but coarse: every result is labelled precision "city" with confidence ≤ 0.5. Never used to place a clinic.',
    status: 'implemented',
    phase: 1,
    category: 'maps',
    port: '@/platform/location/ports#GeocodingPort',
    envVars: ['MAPS_PROVIDER'],
  },
  {
    id: 'TL-INT-SEARCH-PG-001',
    name: 'PostgreSQL Search',
    description:
      'The search port implemented on the application database: weighted tsvector, synonyms, pg_trgm typo tolerance, facets and radius. Selected when SEARCH_PROVIDER is unset or "postgres".',
    status: 'implemented',
    phase: 1,
    category: 'search',
    port: '@/platform/search/ports#SearchPort',
    envVars: ['SEARCH_PROVIDER'],
  },
  {
    id: 'TL-INT-SEARCH-001',
    name: 'Search Engine',
    description:
      'External search index for discovery at scale. PostgreSQL full-text search is the interim implementation behind the same port.',
    status: 'prepared',
    phase: 4,
    category: 'search',
    port: '@/platform/search/ports#SearchPort',
    envVars: ['SEARCH_PROVIDER', 'SEARCH_HOST', 'SEARCH_API_KEY'],
  },
  {
    id: 'TL-INT-ANALYTICS-001',
    name: 'Analytics Provider',
    description:
      'Product analytics event sink. Event payloads carry no PII and no PHI — that constraint is enforced before dispatch, not by trusting the provider.',
    status: 'prepared',
    phase: 2,
    category: 'analytics',
    port: '@/platform/analytics/ports#AnalyticsPort',
    envVars: ['ANALYTICS_PROVIDER', 'ANALYTICS_WRITE_KEY'],
  },
  {
    id: 'TL-INT-AI-001',
    name: 'AI Model Provider',
    description:
      'Language-model inference, bound by the AI covenant (Constitution §5). The port exists and answers NOT_CONFIGURED until a provider is connected; the one purpose allowed today is a labelled summary of a published, reviewed article.',
    status: 'prepared',
    phase: 11,
    category: 'ai',
    port: '@/platform/ai/ports#AiPort',
    envVars: ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'],
  },
  {
    id: 'TL-INT-SSO-001',
    name: 'Enterprise Sign-in (OIDC / SAML)',
    description:
      'Staff of an organization with its own identity provider sign in through it. The port exists and answers NOT_CONFIGURED until a provider is connected; the sign-in page offers nothing until then. An enterprise identity may only sign in to the existing account with the same verified email — never create a second account.',
    status: 'prepared',
    phase: 12,
    category: 'identity',
    port: '@/platform/auth/sso-ports#SsoPort',
    envVars: ['SSO_PROVIDER', 'SSO_ISSUER_URL', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET'],
  },
  {
    id: 'TL-INT-ERRORS-001',
    name: 'Error Tracking',
    description:
      'Exception aggregation and alerting. Scrubbing rules strip request bodies and headers before dispatch so a crash report cannot become a data leak.',
    status: 'prepared',
    phase: 1,
    category: 'analytics',
    port: '@/platform/observability/ports#ErrorTrackingPort',
    envVars: ['ERROR_TRACKING_DSN', 'ERROR_TRACKING_ENVIRONMENT'],
  },
] as const;

export const INTEGRATION_BY_ID: ReadonlyMap<string, Integration> = new Map(
  INTEGRATIONS.map((i) => [i.id, i]),
);

/** Every env var name any integration may require — used to generate .env.example. */
export const INTEGRATION_ENV_VARS: readonly string[] = Array.from(
  new Set(INTEGRATIONS.flatMap((i) => i.envVars)),
).sort();
