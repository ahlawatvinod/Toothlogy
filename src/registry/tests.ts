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
  {
    id: 'TL-TEST-AUTH-FACTORS-001',
    name: 'Second factors and secrets',
    description:
      'TOTP against the RFC 6238/4226 vectors, drift window and replay refusal; recovery-code format; the AES-GCM secret box (round trip, tamper detection, purpose separation, no default key); quiet hours on the recipient’s clock; idempotency claims; login-risk device families.',
    status: 'implemented',
    phase: 1,
    level: 'security',
    path: 'tests/platform/auth-factors.test.ts',
    covers: ['TL-CORE-AUTH-001', 'TL-CORE-HTTP-001', 'TL-CORE-NOTIFICATIONS-001'],
    dimensions: ['AUTH', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-PLATFORM-CORE-001',
    name: 'Platform core against PostgreSQL',
    description:
      'Outbox relay with receipts, retry and dead-lettering; honest notification states (in-app delivered, unconfigured email FAILED never SENT); single-use links never stored; quiet-hours deferral; full MFA sign-in with replay and recovery-code reuse refused; HTTP idempotent replay and key misuse; new-device alerts; restore and erasure; phone OTP with SMS unconfigured; job-runner authorization.',
    status: 'implemented',
    phase: 1,
    level: 'integration',
    path: 'tests/integration/platform-core.test.ts',
    covers: [
      'TL-CORE-AUTH-001',
      'TL-CORE-NOTIFICATIONS-001',
      'TL-CORE-EVENTS-001',
      'TL-DEVOPS-JOBS-001',
      'TL-CORE-HTTP-001',
    ],
    dimensions: ['FUNCTIONAL', 'DATABASE', 'AUTH', 'SECURITY', 'NOTIFICATIONS', 'INTEGRATIONS', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-ROUTES-001',
    name: 'Routes match the API registry',
    description:
      'Scans every route handler: each defineRoute id must be registered with the same method, path and permissions, and every implemented registry endpoint must have a handler.',
    status: 'implemented',
    phase: 1,
    level: 'api',
    path: 'tests/registry/routes.test.ts',
    covers: ['TL-CORE-HTTP-001'],
    dimensions: ['API', 'PERMISSIONS', 'REGRESSION'],
  },
  {
    id: 'TL-TEST-PAGES-001',
    name: 'Pages match the page registry',
    description:
      'Every page.tsx route is registered and every registered route has a page; no authenticated or staff page is marked indexable.',
    status: 'implemented',
    phase: 2,
    level: 'ui',
    path: 'tests/registry/pages.test.ts',
    covers: ['TL-EXPERIENCE-SHELL-001'],
    dimensions: ['SEO', 'REGRESSION'],
  },
  {
    id: 'TL-TEST-GLOBAL-FILES-001',
    name: 'Globalization rules, content sniffing, search filters',
    description:
      'Postal-code rules that never falsely reject, local address order, E.164 normalisation and display, magic-byte sniffing that never recognises HTML or SVG, purpose sensitivity, storage-key traversal refusal, allow-listed search filters.',
    status: 'implemented',
    phase: 1,
    level: 'unit',
    path: 'tests/platform/globalization-files.test.ts',
    covers: ['TL-CORE-I18N-001', 'TL-CORE-STORAGE-001', 'TL-CORE-SEARCH-001'],
    dimensions: ['FUNCTIONAL', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-AVAILABILITY-001',
    name: 'Availability engine rules',
    description:
      'Split shifts and breaks, local-to-UTC conversion, closures, dentist sessions within clinic hours, video outside them, leave, existing appointments and buffers, chair capacity across dentists, notice and emergency, no past slots, booking window, type eligibility, blocked practice, duration fit, determinism, daylight-saving change.',
    status: 'implemented',
    phase: 4,
    level: 'unit',
    path: 'tests/lib/availability.test.ts',
    covers: ['TL-AVAILABILITY-ENGINE-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'REGRESSION'],
  },
  {
    id: 'TL-TEST-BOOKING-CHAIN-001',
    name: 'Availability → booking → lifecycle → leads → paid-lead billing',
    description:
      'Against the real database and outbox handlers: slots from state; instant and request booking; invalid, past and emergency refusals; key replay; three simultaneous bookings with one winner; the exclusion constraint without the service; cross-tenant privacy; every lifecycle step and refused skips and duplicates; cancel, reschedule and practice proposals; waitlist offer, exclusivity, lapse and hand-off; qualification on confirmation; PENDING_FUNDS then one ₹50 + GST charge after a recharge (organizations with no free allowance); no charge for unverified, duplicate or member patients; conversion; callback contact withheld until paid; cross-practice lead access; disputes, refunds, reversals, append-only ledger, wallet floor, ledger integrity and statements.',
    status: 'implemented',
    phase: 4,
    level: 'integration',
    path: 'tests/integration/booking-leads-billing.test.ts',
    covers: ['TL-APPOINTMENT-BOOKING-001', 'TL-AVAILABILITY-ENGINE-001', 'TL-WAITLIST-001', 'TL-LEADS-ENGINE-001', 'TL-BILLING-WALLET-001'],
    dimensions: ['FUNCTIONAL', 'SECURITY', 'EDGE_CASES', 'PERMISSIONS', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-PHASE4-COMPLETION-001',
    name: 'Tiered lead pricing, recharges, statements, reminders, video, races and isolation',
    description:
      'Against the real database and outbox: leads 1, 29 and 30 free and 31 and 32 at ₹50 + ₹9 GST with unique ordinals; concurrent qualification across the allowance boundary; duplicate, declined, unverified and internal leads never billed; PENDING_FUNDS charged exactly once when credits and retries race; recharge minimum of 20 paid leads (₹1,000 + ₹180 GST) with an audited staff override; credit key replay, missing key, cross-organization key reuse, bad amounts and non-staff callers; a reconciling statement with GST, free and paid counts that is labelled not a tax invoice; tomorrow/today/soon reminders once each across concurrent jobs, never for cancelled or completed visits, again for a moved one, follow-ups once; video with no provider (no meeting, no link) and with a test adapter (meeting follows reschedule and cancellation); reschedule and cancellation races; every appointment, lead and wallet notification through the outbox with no unconfigured channel marked delivered; tenant isolation, IDOR and tampered fields.',
    status: 'implemented',
    phase: 4,
    level: 'integration',
    path: 'tests/integration/phase4-completion.test.ts',
    covers: ['TL-APPOINTMENT-BOOKING-001', 'TL-LEADS-ENGINE-001', 'TL-BILLING-WALLET-001'],
    dimensions: ['FUNCTIONAL', 'SECURITY', 'EDGE_CASES', 'PERMISSIONS', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-E2E-BOOKING-001',
    name: 'Browser end-to-end: patient booking and practice lifecycle',
    description:
      'Real Chrome against the running development server (Playwright, `npm run test:e2e`): a new patient registers through the form, searches for video consultations, opens the dentist, picks service, type and a free slot, sends the request, reschedules, cancels and rebooks; the practice owner signs in, confirms, checks in, starts and completes the visit, sees the lead billed by the tiered rule and marks it converted; the patient’s in-app notifications are checked. One documented fixture step marks the new patient’s email verified, because no email provider is connected.',
    status: 'implemented',
    phase: 4,
    level: 'e2e',
    path: 'tests/e2e/patient-and-practice.spec.ts',
    covers: ['TL-APPOINTMENT-BOOKING-001', 'TL-AVAILABILITY-ENGINE-001', 'TL-LEADS-ENGINE-001', 'TL-BILLING-WALLET-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'PERMISSIONS'],
  },
  {
    id: 'TL-TEST-E2E-SPONSORED-001',
    name: 'Browser end-to-end: Prime / Sponsored',
    description:
      'Real Chrome against the development server: the practice owner creates a campaign (subject, dates, budget, appointment-type targeting) with a labelled preview and activates it from the wallet (hold verified in the ledger); a second, over-budget campaign is refused at activation with nothing moved; a new patient sees the Sponsored section on /find apart from the organic results (which carry no paid label), clicks through to the profile, books with the click attributed, and the confirmed lead is billed by the tiered rule; the campaign page shows the lead; pausing removes the slot from /find; cancelling refunds the unspent budget exactly once.',
    status: 'implemented',
    phase: 4,
    level: 'e2e',
    path: 'tests/e2e/sponsored.spec.ts',
    covers: ['TL-SPONSORED-PLACEMENT-001', 'TL-BILLING-WALLET-001', 'TL-APPOINTMENT-BOOKING-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-SPONSORED-001',
    name: 'Prime / Sponsored placement',
    description:
      'Against the real database and outbox: campaign validation (dates, minimum budget, treatments, ownership, verification, placements) and duplicates; activation holds the budget (GST kept apart) and charges day one, once, under concurrent accrual; insufficient funds refused with no ledger entry and no negative wallet; one of three simultaneous activations wins; only valid, targeted (distance, treatment, appointment type), eligible, bookable, running campaigns are served — drafts, paused, expired and paused-booking practices are not — while organic search results stay identical; clicks once per impression, own-team and stale clicks excluded, lead attribution only for real clicks on the same practice; cancel, end and exhaustion refund exactly once; a database CHECK forbids spend beyond the hold; budgets only increase while running; statement sponsored lines reconcile; cross-tenant reads, actions and activation refused; staff actions audited.',
    status: 'implemented',
    phase: 4,
    level: 'integration',
    path: 'tests/integration/sponsored.test.ts',
    covers: ['TL-SPONSORED-PLACEMENT-001', 'TL-BILLING-WALLET-001', 'TL-DISCOVERY-INDEX-001'],
    dimensions: ['FUNCTIONAL', 'SECURITY', 'EDGE_CASES', 'PERMISSIONS', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-LEAD-PRICING-001',
    name: 'Lead pricing, free-allowance and reminder rules',
    description: 'Pure rules at their boundaries: ₹50 + 18% GST = 5900 paise; GST kept apart from price; the 30-lead free allowance (1, 29, 30 free; 31, 32 payable); tomorrow/today/soon windows in the branch timezone; internal and test-domain leads not qualified.',
    status: 'implemented',
    phase: 4,
    level: 'unit',
    path: 'tests/lib/lead-pricing.test.ts',
    covers: ['TL-LEADS-ENGINE-001', 'TL-BILLING-WALLET-001', 'TL-APPOINTMENT-BOOKING-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'PAYMENT'],
  },
  {
    id: 'TL-TEST-FIND-QUERY-001',
    name: 'Find page query parsing',
    description:
      'Defaults; distance order when a place is given without text; allow-listed filters with the fee converted to minor units; clinic searches apply only clinic filters; malformed values ignored with notices; only offered radii; never distance order without a centre.',
    status: 'implemented',
    phase: 4,
    level: 'unit',
    path: 'tests/lib/find-query.test.ts',
    covers: ['TL-DISCOVERY-INDEX-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES', 'SECURITY'],
  },
  {
    id: 'TL-TEST-DISCOVERY-INDEX-001',
    name: 'Discovery index publishing rules',
    description:
      'Publishes a dentist only when verified and confirmed at a located branch; never an unverified one; one document per branch so radius search finds them near each and not elsewhere; organic hits never promoted; language and branch-treatment filters and facet counts; closing the only branch withdraws at once; clinics indexed only while verification is current; a wiped index rebuilds; merit-only score bounded 0–1.',
    status: 'implemented',
    phase: 4,
    level: 'integration',
    path: 'tests/integration/discovery-index.test.ts',
    covers: ['TL-DISCOVERY-INDEX-001', 'TL-CORE-SEARCH-001'],
    dimensions: ['FUNCTIONAL', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-OPENING-HOURS-001',
    name: 'Opening hours form conversion',
    description:
      'HH:MM ↔ minutes including 24:00 as a closing time only; split-shift round trip; reversed and overlapping sessions named per day in any typing order; touching sessions allowed; the 21-session limit; copying a day without shared objects.',
    status: 'implemented',
    phase: 3,
    level: 'unit',
    path: 'tests/lib/opening-hours.test.ts',
    covers: ['TL-LOCATION-GEO-001'],
    dimensions: ['FUNCTIONAL', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-CLINIC-CATALOGUE-001',
    name: 'Clinic services, branches, practice settings and claims',
    description:
      'Catalogue-bound offerings in the organization currency; duplicate, range, video and home-visit rules; tenant scoping; dentist-specific prices only with a confirmed practice; closures on the clinic calendar; closing a branch removes its dentists from search; practice settings by dentist or clinic only; claims need own evidence, cannot be self-approved, and approval grants ownership exactly once; a reviewer reads claim evidence only while the request is pending and never uncited files; the reviewer view carries organization, submitter, role and documents; the public clinic view lists only confirmed discoverable dentists, treats expired verification as unverified, and hides suspended or fully closed clinics.',
    status: 'implemented',
    phase: 3,
    level: 'integration',
    path: 'tests/integration/clinic-catalogue.test.ts',
    covers: ['TL-CLINIC-CATALOGUE-001', 'TL-LOCATION-GEO-001', 'TL-DENTIST-PROFILE-001', 'TL-DENTIST-VERIFICATION-001'],
    dimensions: ['FUNCTIONAL', 'PERMISSIONS', 'SECURITY', 'EDGE_CASES'],
  },
  {
    id: 'TL-TEST-PLATFORM-SERVICES-001',
    name: 'Files, search, geography, preferences, organizations',
    description:
      'Uploads through to signed download on a real disk, disguised/oversize refusal, cross-user denial with access logging, public vs private serving, retention-aware purge; synonym, typo, facet and radius search; city-level geocoding; validated preferences; locked transactional categories; signed unsubscribe; append-only consent; owner protection, verification completeness, ownership transfer and un-verification on credential edits.',
    status: 'implemented',
    phase: 1,
    level: 'integration',
    path: 'tests/integration/platform-services.test.ts',
    covers: [
      'TL-CORE-STORAGE-001',
      'TL-CORE-SEARCH-001',
      'TL-LOCATION-GEO-001',
      'TL-USERS-PREFERENCES-001',
      'TL-CORE-RBAC-001',
    ],
    dimensions: ['FUNCTIONAL', 'DATABASE', 'SECURITY', 'PERMISSIONS', 'EDGE_CASES', 'INTEGRATIONS'],
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
