/**
 * TOOTHLOGY TOOL REGISTRY
 *
 * A TOOL is a reusable cross-cutting capability that many modules consume
 * (Constitution §6, §24). Tools exist so that capability is written once: a
 * division that ships its own SMS sender or its own PDF generator is a defect,
 * not a preference (Constitution P7).
 *
 * `requiresProvider: true` means the tool is a port with no built-in
 * implementation — it does nothing until an external provider is configured, and
 * until then it returns a typed NOT_CONFIGURED error rather than faking success
 * (Constitution P10).
 *
 * `module` is the import path of the tool's contract, so a consumer can find it
 * without searching. Tools with status 'planned' have no file at that path yet;
 * the path records where it will live.
 */

import type { Tool } from './types';

export const TOOLS: readonly Tool[] = [
  {
    id: 'TL-TOOL-SEARCH-001',
    name: 'Search Tool',
    description:
      'Query, filter, facet, sort and paginate any registered searchable entity through one contract.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/search',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-LOCATION-001',
    name: 'Location Tool',
    description: 'Coordinates, addresses, distance, bounding boxes and radius queries.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/location',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-MAP-001',
    name: 'Map Tool',
    description: 'Map rendering, markers, clustering and viewport control.',
    status: 'planned',
    phase: 4,
    module: '@/platform/location/map',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-GPS-001',
    name: 'GPS Tool',
    description:
      'Browser geolocation with explicit permission handling and graceful degradation when denied.',
    status: 'planned',
    phase: 4,
    module: '@/platform/location/gps',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-GEOCODE-001',
    name: 'Geocoding Tool',
    description: 'Forward and reverse geocoding between addresses and coordinates.',
    status: 'prepared',
    phase: 4,
    module: '@/platform/location/ports',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-GEOFENCE-001',
    name: 'Geofence Tool',
    description:
      'Radius and polygon geofences with entry, exit and dwell semantics, shared by appointments, campaigns, notifications and fraud signals.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/location/geofence',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-OTP-001',
    name: 'OTP Tool',
    description:
      'One-time-code generation, hashed storage, expiry and attempt limiting for phone and email verification.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/auth/otp',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-EMAIL-001',
    name: 'Email Tool',
    description: 'Transactional and templated email dispatch.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/notifications/ports',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-SMS-001',
    name: 'SMS Tool',
    description: 'SMS dispatch with per-country sender rules and delivery reporting.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/notifications/ports',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-NOTIFICATION-001',
    name: 'Notification Tool',
    description:
      'Channel-agnostic dispatch that resolves user preference, locale and the transactional/marketing distinction before choosing channels.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/notifications',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-FILE-001',
    name: 'File Tool',
    description:
      'Upload, download, and lifecycle for stored objects, with authorization enforced before any URL is issued.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/storage',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-IMAGE-001',
    name: 'Image Tool',
    description: 'Image validation, resizing, format negotiation and stripping of EXIF metadata.',
    status: 'planned',
    phase: 3,
    module: '@/platform/storage/image',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-PDF-001',
    name: 'PDF Tool',
    description: 'PDF generation for prescriptions, invoices, reports and certificates.',
    status: 'planned',
    phase: 6,
    module: '@/platform/documents/pdf',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-QR-001',
    name: 'QR Tool',
    description: 'QR generation and scanning for check-in, prescriptions and device pairing.',
    status: 'planned',
    phase: 6,
    module: '@/platform/documents/qr',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-CALENDAR-001',
    name: 'Calendar Tool',
    description:
      'Timezone-correct slots, recurrence, business hours and holiday calendars — the scheduling substrate under appointments.',
    status: 'planned',
    phase: 4,
    module: '@/platform/calendar',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-PAYMENT-001',
    name: 'Payment Tool',
    description: 'Provider-agnostic payment intents, captures, refunds and webhook verification.',
    status: 'prepared',
    phase: 4,
    module: '@/platform/payments',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-CURRENCY-001',
    name: 'Currency Tool',
    description:
      'Minor-unit money arithmetic, currency-aware formatting, allocation without rounding loss, and the exchange-rate port.',
    status: 'implemented',
    phase: 1,
    module: '@/platform/money',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-TRANSLATION-001',
    name: 'Translation Tool',
    description: 'Message catalogue lookup, interpolation and locale fallback.',
    status: 'implemented',
    phase: 1,
    module: '@/platform/i18n',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-ANALYTICS-001',
    name: 'Analytics Tool',
    description: 'Product event capture with a consistent schema and no PII in event payloads.',
    status: 'prepared',
    phase: 1,
    module: '@/platform/analytics',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-AI-001',
    name: 'AI Tool',
    description:
      'Model invocation bound by the AI covenant (Constitution §5): labelled output, no diagnosis, no privileged data path, auditable ranking influence.',
    status: 'planned',
    phase: 11,
    module: '@/platform/ai',
    requiresProvider: true,
  },
  {
    id: 'TL-TOOL-VERIFICATION-001',
    name: 'Verification Tool',
    description:
      'Evidence-backed verification with verifier identity, timestamp, expiry and revocation (Constitution P2).',
    status: 'planned',
    phase: 3,
    module: '@/platform/verification',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-AUDIT-001',
    name: 'Audit Tool',
    description: 'Append-only audit event recording, shared by every division.',
    status: 'implemented',
    phase: 1,
    module: '@/platform/audit',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-REPORTING-001',
    name: 'Reporting Tool',
    description: 'Tabular reports, aggregation and export for operational and business reporting.',
    status: 'planned',
    phase: 10,
    module: '@/platform/reporting',
    requiresProvider: false,
  },
  {
    id: 'TL-TOOL-RECOMMENDATION-001',
    name: 'Recommendation Tool',
    description:
      'Personalized ranking and suggestions. Every recommendation must be explainable and its influence auditable (Constitution P3, §5).',
    status: 'planned',
    phase: 11,
    module: '@/platform/recommendation',
    requiresProvider: true,
  },
] as const;

export const TOOL_BY_ID: ReadonlyMap<string, Tool> = new Map(TOOLS.map((t) => [t.id, t]));
