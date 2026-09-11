/**
 * TOOTHLOGY IDENTIFIERS
 *
 * Two different kinds of identifier exist in Toothlogy and conflating them
 * causes real problems, so they are separated here:
 *
 * 1. **Architecture IDs** (`TL-CORE-HTTP-001`) name *design objects* — divisions,
 *    modules, pages, permissions. They are written by hand, live in the registry
 *    and in documentation, and are never reused (Constitution P6).
 *
 * 2. **Record IDs** name *rows*. They are generated at runtime, must be
 *    unguessable, and must be safe to put in a URL.
 *
 * Record IDs use a prefixed, time-ordered format:
 *
 *     usr_01JF3QK8ZR7X2V9NBQ4C6T5MHD
 *     └┬┘ └──────────┬─────────────┘
 *      │             └── ULID: 48-bit timestamp + 80 bits of randomness
 *      └── entity prefix
 *
 * Why not a plain UUID v4:
 *
 * - **The prefix** makes an ID self-describing. `usr_…` in a log or a support
 *   ticket is immediately identifiable, and passing a clinic ID where a user ID
 *   was expected is caught by a cheap runtime check rather than by a confusing
 *   "not found".
 * - **Time-ordered** keeps B-tree index inserts local instead of scattering
 *   writes across the index, which matters once tables are large.
 * - **Crockford base32** has no ambiguous characters (no I, L, O, U), so an ID
 *   read aloud to support or typed from a screen survives the round trip.
 */

import { randomBytes } from 'node:crypto';

/**
 * Entity prefixes. Registered centrally so two divisions cannot pick the same
 * one — a collision would defeat the point of the prefix.
 */
export const ID_PREFIXES = {
  user: 'usr',
  session: 'ses',
  credential: 'crd',
  organization: 'org',
  organizationMember: 'orm',
  profile: 'prf',
  address: 'adr',
  auditEvent: 'aud',
  consent: 'cns',
  outboxEvent: 'out',
  idempotency: 'idm',
  featureFlagOverride: 'flg',
  file: 'fil',
  notificationPreference: 'nfp',
  request: 'req',

  // --- Phase 1 completion ---
  userPreference: 'upf',
  recoveryCode: 'rcv',
  securityEvent: 'sev',
  fileAccess: 'fax',
  synonym: 'syn',
  notification: 'ntf',
  location: 'loc',
  verification: 'ver',
  invitation: 'inv',
  token: 'tok',
  roleAssignment: 'rla',

  // --- Phase 3 ---
  treatment: 'trt',
  service: 'svc',
  closure: 'cls',
  businessHours: 'bhr',
  practice: 'prc',
  qualification: 'qal',

  // --- Phase 4 ---
  availabilityRule: 'avr',
  availabilityException: 'avx',
  appointment: 'apt',
  appointmentEvent: 'ape',
  waitlist: 'wtl',
  dependent: 'dep',
  followUp: 'fup',
  lead: 'led',
  leadEvent: 'lde',
  wallet: 'wal',
  ledgerEntry: 'lgr',
  invoice: 'inc',
  pricingRule: 'lpr',
  qualificationRule: 'lqr',
  dispute: 'dsp',
  campaign: 'cmp',
  adEvent: 'ade',
  appointmentReminder: 'rmd',
  videoMeeting: 'vmt',
  campaignDay: 'cmd',
  placementSettings: 'sps',
  geofence: 'geo',
  district: 'dst',
  extractionBatch: 'exb',
  extractedRecord: 'exr',
  outreachTask: 'otk',
  outreachActivity: 'oac',
  course: 'crs',
  admissionCycle: 'acy',
  admissionEnquiry: 'aen',
  admissionEnquiryEvent: 'aev',
  camp: 'dcp',
  campDoctor: 'cdr',
  campRegistration: 'crg',
  // Quote requests use the reserved `rfq` and products the reserved `product` below.
  quoteEvent: 'qev',
  // Community questions, answers and reports use the reserved `question`, `answer`, `report`.
  publication: 'pub',
  facultyAppointment: 'fap',
  // Message threads and messages use the reserved `thread` and `message`.
  supportTicket: 'tkt',
  supportMessage: 'smg',

  // --- Phases 5-12 ---
  review: 'rev',
  reviewResponse: 'rvr',
  report: 'rpt',
  thread: 'thr',
  message: 'msg',
  question: 'qst',
  answer: 'ans',
  record: 'rec',
  accessGrant: 'agr',
  treatmentPlan: 'tpl',
  treatmentPlanItem: 'tpi',
  prescription: 'rx',
  article: 'art',
  comment: 'cmt',
  author: 'aut',
  college: 'col',
  student: 'stu',
  enrolment: 'enr',
  posting: 'pst',
  application: 'apl',
  interview: 'itv',
  product: 'prd',
  variant: 'var',
  cart: 'crt',
  order: 'ord',
  shipment: 'shp',
  rfq: 'rfq',
  quote: 'quo',
  aiInteraction: 'aii',
  device: 'dev',
  telemetry: 'tel',
  alert: 'alr',
  exchangeRate: 'fxr',
  analyticsEvent: 'evt',

  // --- Phase 9: orders, tax documents, returns, equipment service ---
  // Variants, cart lines and orders use the reserved `variant`, `cart`, `order`.
  orderLine: 'orl',
  orderEvent: 'ore',
  orderPayment: 'opy',
  taxDocument: 'txd',
  returnRequest: 'ret',
  asset: 'eqa',
  serviceContract: 'amc',
  serviceVisit: 'svv',

  // --- Phase 10: Prime ---
  membershipPlan: 'pln',
  membership: 'mbr',

  // --- Phase 12: enterprise (exchange rates use the reserved `exchangeRate`) ---
  enterpriseAgreement: 'ent',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];
export type EntityKind = keyof typeof ID_PREFIXES;

/** Crockford base32 — excludes I, L, O and U to avoid transcription errors. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_LENGTH = 26;

/**
 * Generate a ULID.
 *
 * The first 10 characters encode the millisecond timestamp, giving lexicographic
 * time ordering; the remaining 16 carry 80 bits of cryptographic randomness,
 * which is what makes the ID unguessable — a sequential integer ID in a URL is
 * an enumeration vulnerability, and these appear in URLs.
 */
export function ulid(now: number = Date.now()): string {
  let timePart = '';
  let time = now;
  for (let i = 0; i < 10; i += 1) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }

  const bytes = randomBytes(16);
  let randomPart = '';
  for (let i = 0; i < 16; i += 1) {
    randomPart += CROCKFORD[bytes[i]! % 32];
  }

  return timePart + randomPart;
}

/** Generate a prefixed record ID for an entity kind. */
export function newId(kind: EntityKind): string {
  return `${ID_PREFIXES[kind]}_${ulid()}`;
}

/**
 * Check that an ID belongs to the expected entity kind.
 *
 * Cheap defence against the class of bug where an ID of the wrong type flows
 * into a query and silently matches nothing — or, worse, matches something.
 */
export function isIdOfKind(id: string, kind: EntityKind): boolean {
  const prefix = ID_PREFIXES[kind];
  if (!id.startsWith(`${prefix}_`)) return false;
  const body = id.slice(prefix.length + 1);
  return body.length === ULID_LENGTH && [...body].every((c) => CROCKFORD.includes(c));
}

/** Extract the prefix from a record ID, or null if it is not in our format. */
export function idPrefixOf(id: string): string | null {
  const separator = id.indexOf('_');
  if (separator <= 0) return null;
  return id.slice(0, separator);
}

/**
 * A request correlation ID.
 *
 * Attached to every log line, audit event and error response for a request, so
 * a user reporting "it failed at 3pm" can be traced to the exact request across
 * every log source (founding spec §12, §22).
 */
export function newRequestId(): string {
  return `${ID_PREFIXES.request}_${ulid()}`;
}
