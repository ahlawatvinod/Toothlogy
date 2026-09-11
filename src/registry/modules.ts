/**
 * TOOTHLOGY MODULE REGISTRY
 *
 * A MODULE is a coherent unit of functionality belonging to exactly one
 * division. Modules are the level at which work is planned, built and certified.
 *
 * Every module MUST map to at least one pillar (Constitution §2.1) — the
 * registry integrity test rejects an empty `pillars` array. This is the
 * mechanical form of the rule that a feature mapping to no pillar does not
 * belong in Toothlogy.
 *
 * STATUS IS REPORTED HONESTLY (Constitution P9):
 *   'implemented' 🟡→✅ code exists, is wired up, and has tests
 *   'prepared'    🟡    contracts/ports exist; no working behaviour behind them
 *   'planned'     🔴    ID reserved and dependencies recorded; no code
 *
 * Only Phase 0 foundation modules are 'implemented'. The four domain modules at
 * the bottom are the anchor IDs named in the founding specification, registered
 * now purely to reserve those IDs (Constitution P6) — they contain no code.
 */

import type { Module } from './types';

export const MODULES: readonly Module[] = [
  // =========================================================================
  // Division 01 — Core platform (Phase 0 foundation)
  // =========================================================================
  {
    id: 'TL-CORE-KERNEL-001',
    name: 'Platform Kernel',
    description:
      'Cross-cutting primitives every other module builds on: typed error taxonomy, result types, ID helpers and lifecycle conventions.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: [],
  },
  {
    id: 'TL-CORE-CONFIG-001',
    name: 'Configuration & Environment',
    description:
      'Schema-validated environment loading. Fails fast at boot on missing or malformed configuration, and marks secrets so they can never be logged or sent to the client.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-HTTP-001',
    name: 'HTTP & API Conventions',
    description:
      'The shared response envelope, error mapping, pagination, filtering, sorting, idempotency, rate limiting and security headers that every API route inherits (Constitution P7).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-CORE-AUTH-001',
    name: 'Authentication',
    description:
      'Registration, login with lockout and new-device detection, server-side sessions, password reset and change, email verification links, phone verification by SMS code, TOTP two-step verification with recovery codes, account deletion with a 30-day grace period, restoration and erasure. SMS and email delivery depend on provider configuration and report NOT_CONFIGURED honestly.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-RBAC-001',
    name: 'Authorization & RBAC',
    description:
      'Default-deny permission evaluation over roles, scopes and organization membership. The single decision point every route calls.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-EVENTS-001',
    name: 'Domain Event Bus',
    description:
      'In-process typed event publication and subscription, with a transport port so the same producers work unchanged against a durable queue later.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-CORE-I18N-001',
    name: 'Internationalization',
    description:
      'Locale negotiation, direction (LTR/RTL), message catalogues, and locale-aware date, number, phone and address formatting.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['LEARN', 'CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-MONEY-001',
    name: 'Money & Currency',
    description:
      'Integer minor-unit money arithmetic, currency-aware formatting and allocation without rounding loss. Floats are never used for money (Constitution §4).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['BOOK', 'TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-FLAGS-001',
    name: 'Feature Flags',
    description:
      'Registry-declared flags with per-environment defaults and env overrides, driving the disabled → development → beta → enabled → deprecated lifecycle (Constitution §10).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-OBSERVABILITY-001',
    name: 'Logging & Observability',
    description:
      'Structured JSON logging with automatic secret/PHI redaction, request IDs, request-scoped context and health reporting. Never logs secrets (Constitution §9).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-CONFIG-001'],
  },
  {
    id: 'TL-CORE-SEARCH-001',
    name: 'Search Abstraction',
    description:
      'Provider-agnostic search contract, implemented on PostgreSQL: weighted full text, synonym expansion, trigram typo tolerance, allow-listed facet filters and counts, radius search, merit-only ranking and cursor paging. An external engine can replace the adapter without changing callers.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['DISCOVER'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-CORE-STORAGE-001',
    name: 'File Storage & Document Access',
    description:
      'Uploads with per-purpose size and type policy, magic-byte content sniffing, extension checks and a malware-scanner port; sensitivity decided by purpose; per-file read rules (owner, organization, public purpose, reviewer, registered grants); HMAC-signed expiring download URLs; access logging; retention-aware deletion and purge. Local disk adapter implemented; cloud object storage and a malware scanner are not configured.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-KERNEL-001', 'TL-CORE-RBAC-001'],
  },
  {
    id: 'TL-CORE-NOTIFICATIONS-001',
    name: 'Notification Service',
    description:
      'Channel-agnostic dispatch across in-app, push, email, SMS and WhatsApp: per-category preferences, marketing consent, quiet hours, per-channel templates, a delivery record per channel, retries with backoff, and transient data for single-use secrets. In-app delivery is real; external channels fail with NOT_CONFIGURED until a provider adapter is configured, and are recorded as FAILED, never as sent.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-INTEGRATIONS-PORTS-001'],
  },

  // =========================================================================
  // Division 02 — Frontend & Experience
  // =========================================================================
  {
    id: 'TL-EXPERIENCE-DESIGNSYSTEM-001',
    name: 'Toothlogy Design System',
    description:
      'Design tokens and accessible component primitives: typography, spacing, colour, buttons, forms, cards, dialogs, tables, tabs, badges, alerts, and the loading/empty/error state vocabulary.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-02-EXPERIENCE',
    pillars: ['LEARN', 'DISCOVER', 'CONNECT'],
    dependsOn: ['TL-CORE-I18N-001'],
  },
  {
    id: 'TL-EXPERIENCE-SHELL-001',
    name: 'Application Shell',
    description:
      'Root layout, theming (light/dark/system), document direction, skip links, error and not-found boundaries, and the responsive/PWA baseline.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-02-EXPERIENCE',
    pillars: ['LEARN', 'DISCOVER'],
    dependsOn: ['TL-EXPERIENCE-DESIGNSYSTEM-001', 'TL-CORE-I18N-001'],
  },

  {
    id: 'TL-EXPERIENCE-PWA-001',
    name: 'Installable Web App',
    description:
      'Web app manifest with rendered PNG icons (any and maskable), a privacy-conservative service worker (never caches pages or API responses; offline fallback page; immutable build assets cache-first), push display handling, and registration in production only.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-02-EXPERIENCE',
    pillars: ['CONNECT', 'BOOK'],
    dependsOn: ['TL-EXPERIENCE-SHELL-001'],
  },

  // =========================================================================
  // Divisions 29, 23, 33, 34, 35 — foundation-bearing infrastructure
  // =========================================================================
  {
    id: 'TL-LOCATION-GEO-001',
    name: 'Geolocation & Geofencing',
    description:
      'Coordinates, haversine distance, bounding boxes for radius search, geofence evaluation for radius and polygon shapes, reference geography APIs, and city-level geocoding from the seeded gazetteer (street-level geocoding and routing need a maps provider, not configured).',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-29-LOCATION',
    pillars: ['DISCOVER', 'BOOK'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-PAYMENTS-GATEWAY-001',
    name: 'Payment Gateway Abstraction',
    description:
      'Provider-agnostic payment intent, capture, refund and webhook contracts with mandatory idempotency keys. No provider is wired, and success is never simulated (Constitution P10).',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-23-PAYMENTS',
    pillars: ['BOOK', 'TRUST'],
    dependsOn: ['TL-CORE-MONEY-001', 'TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-SECURITY-AUDIT-001',
    name: 'Audit Log',
    description:
      'Append-only audit trail recording actor, action, subject, outcome, request ID and timestamp for every mutation and every privileged read.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-33-SECURITY',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-OBSERVABILITY-001'],
  },
  {
    id: 'TL-INTEGRATIONS-PORTS-001',
    name: 'Integration Ports',
    description:
      'The hexagonal boundary for every external provider. Unconfigured providers return a typed NOT_CONFIGURED error rather than pretending to succeed.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-34-INTEGRATIONS',
    pillars: ['CONNECT'],
    dependsOn: ['TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-USERS-PREFERENCES-001',
    name: 'User Preferences, Profile & Consent',
    description:
      'Language, timezone, country, display currency, theme and palette, accessibility, quiet hours, notification category×channel preferences, signed unsubscribe links, append-only consent, saved places and profile photo.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-03-USERS',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-AUTH-001', 'TL-CORE-NOTIFICATIONS-001', 'TL-CORE-STORAGE-001'],
  },
  {
    id: 'TL-DEVOPS-JOBS-001',
    name: 'Background Jobs & Outbox Relay',
    description:
      'The transactional-outbox relay (leased batches, durable handlers with per-handler receipts, backoff, dead-lettering, replay) and the scheduled jobs: notification retries, verification expiry, account erasure, maintenance pruning. Run by any scheduler through a secret-authenticated endpoint.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-35-DEVOPS',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-CORE-NOTIFICATIONS-001'],
  },
  {
    id: 'TL-DEVOPS-HEALTH-001',
    name: 'Health & Readiness',
    description:
      'Liveness and readiness reporting including dependency checks, with detail visible only to principals holding the health-read permission.',
    status: 'implemented',
    phase: 1,
    divisionId: 'TL-DIV-35-DEVOPS',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-HTTP-001'],
  },
  {
    id: 'TL-ADMIN-REGISTRY-001',
    name: 'Registry Introspection',
    description:
      'Read-only API exposing the architecture registry so tooling, tests and the admin console can inspect divisions, modules, permissions and flags at runtime.',
    status: 'implemented',
    phase: 2,
    divisionId: 'TL-DIV-32-ADMIN',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-HTTP-001', 'TL-CORE-RBAC-001'],
  },

  // =========================================================================
  // Phase 3 — Dentist and clinic ecosystem
  // =========================================================================
  {
    id: 'TL-DENTIST-PROFILE-001',
    name: 'Dentist Professional Profile',
    description:
      'Professional identity: qualifications, specialties, languages, fees and practice locations, with the draft/submitted/verified lifecycle that governs discoverability.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-04-DENTISTS',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-RBAC-001', 'TL-CORE-KERNEL-001'],
  },
  {
    id: 'TL-DENTIST-VERIFICATION-001',
    name: 'Credential Verification',
    description:
      'Evidence-backed, revocable, expiring verification of dental registrations and organizations. A reviewer may never decide their own application (Constitution P2).',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-26-REVIEWS',
    pillars: ['TRUST'],
    dependsOn: ['TL-DENTIST-PROFILE-001', 'TL-SECURITY-AUDIT-001'],
  },
  {
    id: 'TL-CLINIC-CATALOGUE-001',
    name: 'Clinic Services & Treatment Catalogue',
    description:
      'Reference treatment catalogue and each clinic’s offerings at each location: price or price-on-consultation, duration, clinic/video/home appointment types, dentist-specific prices, preparation and aftercare. Plus branch management (facilities, photos, accessibility, closures), practice booking settings and evidence-backed clinic claims.',
    status: 'implemented',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    pillars: ['DISCOVER', 'BOOK'],
    dependsOn: ['TL-DENTIST-PROFILE-001', 'TL-LOCATION-GEO-001', 'TL-CORE-RBAC-001'],
  },
  {
    id: 'TL-DISCOVERY-INDEX-001',
    name: 'Discovery Indexer',
    description:
      'Builds search documents for discoverable dentists (one per confirmed, locatable practice, so a dentist is found near every branch) and for public clinics, with facets and a merit-only quality score. Triggered from the discoverability authority and clinic changes; a job rebuilds everything. Integration-tested; delivered with Phase 4. Organic ranking only — sponsored placement is a separate layer that never reads or writes the index.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-10-DISCOVERY',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-SEARCH-001', 'TL-DENTIST-PROFILE-001', 'TL-CLINIC-CATALOGUE-001'],
  },
  {
    id: 'TL-AVAILABILITY-ENGINE-001',
    name: 'Availability Engine',
    description:
      'Deterministic slot generation from database state: branch hours, dentist sessions (split shifts, breaks), closures, observed holidays, leave and blocks, existing appointments with buffers, chair capacity, notice and booking window, timezones, and clinic/video/home-visit/emergency eligibility.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    pillars: ['BOOK', 'DISCOVER'],
    dependsOn: ['TL-DENTIST-PROFILE-001', 'TL-LOCATION-GEO-001', 'TL-CLINIC-CATALOGUE-001'],
  },
  {
    id: 'TL-WAITLIST-001',
    name: 'Waitlist',
    description:
      'Patients wait for an opening; a freed slot becomes a PENDING hold for the first matching entry only (guaranteed by the overlap constraint), expires, and passes to the next.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    pillars: ['BOOK'],
    dependsOn: ['TL-APPOINTMENT-BOOKING-001', 'TL-AVAILABILITY-ENGINE-001'],
  },
  {
    id: 'TL-LEADS-ENGINE-001',
    name: 'Lead Engine',
    description:
      'Leads from bookings and callback requests; a dedicated, versioned qualification rule; deterministic deduplication; delivery, acceptance, contact, appointment, completion and conversion with an event history; patient contact withheld until paid.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-20-LEADS',
    pillars: ['CONNECT', 'TRUST'],
    dependsOn: ['TL-APPOINTMENT-BOOKING-001', 'TL-BILLING-WALLET-001'],
  },
  {
    id: 'TL-BILLING-WALLET-001',
    name: 'Lead Billing: Wallet and Ledger',
    description:
      'Configurable tiered lead pricing (India since 2026-09-10: first 30 qualified leads free, then ₹50 + GST; 20-lead minimum recharge; GST from tax configuration), prepaid wallet with a database floor, append-only ledger, idempotent charges, refunds, reversals, disputes and monthly statements. Card/UPI top-up is NOT_CONFIGURED until a payment provider is connected.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-23-PAYMENTS',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-MONEY-001', 'TL-PAYMENTS-GATEWAY-001'],
  },
  {
    id: 'TL-SPONSORED-PLACEMENT-001',
    name: 'Sponsored Placement (Prime)',
    description:
      'Prime dentist, clinic and hospital campaigns in clearly labelled Sponsored slots on search and profiles, separate from organic ranking (which never reads them). Targeting by distance, treatment and appointment type; shown only while running, funded, eligible and bookable. Budget held from the wallet on activation, one charge per running day, unspent budget refunded on end or cancellation. Clicks counted once per impression, own-organization activity excluded; attribution to leads and conversions. Practice and staff consoles, audited.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-22-ADVERTISING',
    pillars: ['DISCOVER'],
    dependsOn: ['TL-BILLING-WALLET-001', 'TL-DISCOVERY-INDEX-001'],
  },
  {
    id: 'TL-MESSAGING-001',
    name: 'Patient–Practice Messaging',
    description:
      'Conversations between a patient and a practice they have an appointment with — never cold messages. One open conversation per patient, practice and appointment; practice members who may read see it, those who may reply answer; either side closes. Notifications say a message arrived, not what it says. 30 messages a day per person.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-25-COMMUNICATION',
    pillars: ['TRUST'],
    dependsOn: ['TL-APPOINTMENT-BOOKING-001', 'TL-CORE-NOTIFICATIONS-001'],
  },
  {
    id: 'TL-SUPPORT-001',
    name: 'Help and Support Tickets',
    description:
      'Anyone signed in asks Toothlogy for help by category (optionally about an organization they belong to); support staff reply, keep internal notes the requester never sees, assign, resolve and close; a requester’s reply reopens a resolved ticket. /help is the real help page. 5 new tickets a day per person.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-30-SUPPORT',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-AUTH-001', 'TL-CORE-NOTIFICATIONS-001'],
  },
  {
    id: 'TL-REVIEWS-001',
    name: 'Reviews and Ratings',
    description:
      'Reviews tied to visits that took place: only the patient of a completed appointment, within 90 days, once; 1–5 stars and optional text without contact details; editable for 30 days, removable. The practice (administrators or the treating dentist) replies once in public and may flag a review; only a moderator hides one, with the reason the patient is told, or restores it. Public pages show reviewers as first name and initial, and an average only from three reviews.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-26-REVIEWS',
    pillars: ['TRUST'],
    dependsOn: ['TL-APPOINTMENT-BOOKING-001', 'TL-CORE-NOTIFICATIONS-001'],
  },
  {
    id: 'TL-ACADEMIC-001',
    name: 'Researchers and Faculty',
    description:
      'Researcher and faculty profiles beside a person’s account: headline, designation, department, institution, ORCID (format checked), interests from the specialty list, website, and publications with DOIs — all labelled as the person’s own statement. Faculty ask a college to confirm their post; its administrators confirm, decline or end it, and only a confirmed post is shown as faculty at that college (also on the college’s page). Public pages only for profiles their owners make public.',
    status: 'implemented',
    phase: 7,
    divisionId: 'TL-DIV-14-RESEARCH',
    pillars: ['TRUST'],
    dependsOn: ['TL-USERS-PREFERENCES-001', 'TL-EDUCATION-001'],
  },
  {
    id: 'TL-COMMUNITY-001',
    name: 'Dental Community',
    description:
      'Public questions and answers under a closed list of topics, from signed-in people with a verified email (5 questions and 30 answers a day). Not medical advice, and the pages say so; phone numbers and email addresses are refused in public posts. Verified dentists’ answers carry a badge and come first after the accepted one. Authors remove their own posts (text cleared). Anyone may report a post once; three open reports hide it pending review; moderators hide with a reason the author is told, or restore.',
    status: 'implemented',
    phase: 7,
    divisionId: 'TL-DIV-15-MEDIA',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-AUTH-001', 'TL-DENTIST-VERIFICATION-001'],
  },
  {
    id: 'TL-CAMPS-001',
    name: 'Dental Camps',
    description:
      'District dental awareness camps: organizers (dentists, clinic administrators, camp organizers, staff) create a camp with district, dates, venue and capacity and submit it; staff approve it (never their own) before it is public. Verified dentists apply to serve and the organizer decides; attendance is recorded — participation history. Patients register themselves or are recorded at the venue (one per phone and per account; capacity under a row lock; consent to share with the camp’s organizer and doctors). A visit records findings and may refer the patient to a camp doctor; callbacks and bookings with that dentist within 90 days are attributed to the visit through the ordinary lead and booking flows, same qualification and pricing.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-04-DENTISTS',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-INDIA-DATA-001', 'TL-LEADS-ENGINE-001', 'TL-APPOINTMENT-BOOKING-001'],
  },
  {
    id: 'TL-EDUCATION-001',
    name: 'Education: Colleges, Courses, Admissions',
    description:
      'Dental colleges (organizations of type COLLEGE) keep an academic profile — ownership, affiliation, stated recognition, checked only by Toothlogy staff — courses (BDS, MDS by reference specialty, diploma, certificate, fellowship, PhD) with duration, seats, fee and entrance exam (NEET-UG, NEET-MDS, INI-CET), and admission windows per academic year. Public college pages list published courses of claimed colleges. Students with a verified email enquire with consent (one open enquiry per course); colleges work enquiries as admission leads — contacted, applied, admitted or not, closed — with assignment, notes and follow-ups; students follow and withdraw them. Enquiries are not billed. Enrolment closes the funnel: a college enrols a student it admitted (academic year, optional roll number unique within the course and year, start date), keeps its roll by course, year and status, and marks enrolments completed or withdrawn (with a reason); the student is told and sees their enrolments. A record of study, not a certificate.',
    status: 'implemented',
    phase: 8,
    divisionId: 'TL-DIV-06-COLLEGES',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-AUTH-001', 'TL-INDIA-DATA-001'],
  },
  {
    id: 'TL-OPERATIONS-001',
    name: 'Operations: Lead Work, Outreach, District Command Centre',
    description:
      'Practice side: assign a lead to a member, log calls and notes (contact only once the lead is free or paid), schedule follow-ups with an in-app reminder claimed once. Toothlogy side: outreach tasks for extracted records and listings by district — bulk creation with round-robin assignment, one open task per subject, calls and outcomes, activation invitations through the real activation flow (refused while email/SMS are not configured) — and a district command centre of records, listings, activations, live clinics, leads, bookings and agent work. No automated marketing is sent to extracted contacts: they have not consented.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-30-SUPPORT',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-LEADS-ENGINE-001', 'TL-INDIA-DATA-001'],
  },
  {
    id: 'TL-INDIA-DATA-001',
    name: 'India Data: Districts, Extraction, Pre-made Accounts',
    description:
      'Country → State/UT → District (Chhattisgarh seeded; the national list imported from the LGD export, idempotent, aliases instead of duplicates). Extracted directory rows kept as received beside their normalized form, with source, date, district, confidence and a deterministic dedupe key; checked against earlier rows, accounts, registrations and organizations; always UNVERIFIED. Review into pre-made dentist accounts (inactive until email + mobile OTP activation) or unowned clinic, hospital and college listings claimed through the existing review. Automatic external extraction is a NOT_CONFIGURED port.',
    status: 'implemented',
    phase: 5,
    divisionId: 'TL-DIV-32-ADMIN',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-AUTH-001', 'TL-DENTIST-PROFILE-001'],
  },

  // =========================================================================
  // RESERVED ANCHOR IDs — 🔴 NOT IMPLEMENTED
  //
  // These four IDs are named in the founding specification. They are registered
  // now solely to reserve them permanently (Constitution P6) and to record their
  // dependencies. There is no code behind any of them.
  // =========================================================================
  {
    id: 'TL-DISCOVERY-DENTIST-001',
    name: 'Dentist Discovery',
    description:
      'Search, filter and rank dentists: /find over the discovery index (TL-DISCOVERY-INDEX-001) — text, place or “use my location”, radius, specialty, language, treatment, appointment type, emergency and fee, ranked by a 0–1 merit score that never reads spend; Sponsored results are a separate, labelled slot (Constitution P3); the next free time per result comes from the availability engine. Recommendations are rule-based (TL-RECOMMENDATIONS-001, TL-TRIAGE-001).',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-10-DISCOVERY',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-SEARCH-001', 'TL-LOCATION-GEO-001'],
  },
  {
    id: 'TL-APPOINTMENT-BOOKING-001',
    name: 'Appointment Booking',
    description:
      'Booking with database-enforced no-double-booking (exclusion constraint), request and instant modes, family members, and a controlled lifecycle (confirm, decline, cancel, reschedule, check in, start, complete, no-show, expire) with audit, notifications and reminders. Integration- and browser-tested; delivered with Phase 4.',
    status: 'implemented',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    pillars: ['BOOK', 'CONNECT'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-CORE-NOTIFICATIONS-001', 'TL-PAYMENTS-GATEWAY-001'],
  },
  {
    id: 'TL-PATIENT-RECORD-001',
    name: 'Patient Dental Record',
    description:
      'The patient-owned dental record (Constitution P4): treatments, visit notes, X-rays and reports with FDI tooth numbers, for the account holder and family members. The patient always sees all of it; a practice sees it only under the patient’s grant — asked for by the practice or given by the patient, read-only or read-and-add, 30 days / a year / until withdrawn, revocable at any moment, evidenced by a CLINICAL_DATA_SHARING consent. Every practice view and file opening is audited and listed for the patient. Practices retract their own entries with a reason, never edit them. Files ride the file service (sniffed, scanned, 60-second signed URLs for PHI) with a registered grant read rule. In the personal-data export; grants end on erasure, entries stay under clinical retention. Treatment plans: a practice proposes treatments with teeth and tax-inclusive estimates under a read-and-add grant; the patient accepts or declines once; the practice records each treatment done or not done (the plan completes exactly once) or withdraws it with a reason; plans stay in the patient’s record.',
    status: 'implemented',
    phase: 6,
    divisionId: 'TL-DIV-11-RECORDS',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-CORE-STORAGE-001', 'TL-SECURITY-AUDIT-001', 'TL-CORE-RBAC-001'],
  },
  {
    id: 'TL-PRESCRIPTION-001',
    name: 'Prescriptions',
    description:
      'Prescriptions issued by a Toothlogy-verified dentist at a practice under the patient’s grant: medicines with dose, frequency and duration, advice, for the account holder or a family member. A printable page (print or save as PDF) with a QR code a pharmacist scans to check it at /rx/<code> — status, date, prescriber, practice, patient first name and initial, medicines. Cancelled with a reason, never edited.',
    status: 'implemented',
    phase: 6,
    divisionId: 'TL-DIV-12-PRESCRIPTIONS',
    pillars: ['TRUST', 'CONNECT'],
    dependsOn: ['TL-PATIENT-RECORD-001', 'TL-DENTIST-VERIFICATION-001'],
  },
  {
    id: 'TL-ANALYTICS-001',
    name: 'Analytics and Dashboards',
    description:
      'Dashboards computed from the records that are the source of truth — a practice’s bookings and outcomes (attended rate), leads through qualification, booking and treatment, what leads cost (charges less refunds), reviews, dentist profile and clinic page views, most-booked services, per day over 7, 30 or 90 days; and platform-wide totals for operators (accounts, verification, bookings, searches, shared records, lead revenue, community, support). First-party view and search events are recorded with a keyed-hash actor only for people who agreed to analytics, anonymously otherwise; searches record their shape, never the words. No estimates, no identities; a rate with no denominator shows “—”. Plain-SVG charts with text summaries.',
    status: 'implemented',
    phase: 10,
    divisionId: 'TL-DIV-31-ANALYTICS',
    pillars: ['TRUST', 'DISCOVER'],
    dependsOn: ['TL-LEADS-ENGINE-001', 'TL-BILLING-WALLET-001', 'TL-REVIEWS-001'],
  },
  {
    id: 'TL-GLOBAL-EXPANSION-001',
    name: 'Market Opening and Enterprise',
    description:
      'Opening a country is configuration, not code (Constitution §4): staff see every modelled country with its readiness — currency modelled, default language switched on, valid time zone, regions loaded, standard lead price with a current tax rate — and open it only when all pass, or close it to new organizations; organization creation honours the database switch, not the registry seed; audited with a reason. Money is never summed across currencies or converted with invented rates: platform revenue is reported per currency and each practice’s spend in its wallet’s currency. Enterprise sign-in (OIDC/SAML) is a port answering NOT_CONFIGURED, bound never to create a second account for the same person.',
    status: 'implemented',
    phase: 12,
    divisionId: 'TL-DIV-29-LOCATION',
    pillars: ['TRUST', 'DISCOVER'],
    dependsOn: ['TL-CORE-I18N-001', 'TL-CORE-MONEY-001', 'TL-BILLING-WALLET-001'],
  },
  {
    id: 'TL-IOT-001',
    name: 'Connected Equipment',
    description:
      'Practices register connected equipment — autoclaves, chairs, compressors, suction, X-ray units, waterlines, medicine refrigerators. Each device reports readings over HTTPS with its own token (shown once, stored only as a hash, re-keyable); the first reading marks it connected (DEVICE_CONNECTED). The practice sets an acceptable range per reading; a reading outside it, or a reported fault, opens one alert per device and reading, and the practice’s administrators are told. Alerts are resolved by a person with a note, never cleared automatically. Retired, never deleted.',
    status: 'implemented',
    phase: 11,
    divisionId: 'TL-DIV-28-IOT',
    pillars: ['TRUST'],
    dependsOn: ['TL-CORE-EVENTS-001', 'TL-CORE-NOTIFICATIONS-001', 'TL-SECURITY-AUDIT-001'],
  },
  {
    id: 'TL-AI-001',
    name: 'AI under the Covenant',
    description:
      'The AI port (NOT_CONFIGURED until a model provider is connected) and the two purposes allowed today, each under a fixed instruction that forbids advice and diagnosis: a labelled, plain-language summary of a published, clinically reviewed knowledge article, and a labelled, faithful translation of one into a language Toothlogy offers. Only public reviewed text is sent, never patient data. Every call audited with purpose, model and token counts but not the text. Pages offer them only when a provider is configured (Constitution §5, P10). Triage and recommendations are deliberately rule-based (TL-TRIAGE-001, TL-RECOMMENDATIONS-001), not AI.',
    status: 'implemented',
    phase: 11,
    divisionId: 'TL-DIV-27-AI',
    pillars: ['TRUST'],
    dependsOn: ['TL-KNOWLEDGE-001', 'TL-SECURITY-AUDIT-001'],
  },
  {
    id: 'TL-CAREERS-001',
    name: 'Internships and Careers',
    description:
      'Jobs and internships across dentistry: organizations post role, employment type, district, stated pay and closing date; only Toothlogy-verified organizations may publish; no contact details or links in postings. A public board (/careers) with search and filters, JobPosting structured data and sitemap entries. Anyone signed in with a verified email applies once per posting with a résumé (file service, RESUME purpose) and a note, consenting to share contact details with that employer; employers read applications and résumés (registered file read rule) only while an application stands, move them through shortlist, interview, offer, hired or not taken forward — the applicant told each step — and keep internal notes. Applicants withdraw. Postings close themselves after their date.',
    status: 'implemented',
    phase: 8,
    divisionId: 'TL-DIV-08-CAREERS',
    pillars: ['CONNECT', 'TRUST'],
    dependsOn: ['TL-CORE-STORAGE-001', 'TL-INDIA-DATA-001', 'TL-CORE-NOTIFICATIONS-001'],
  },
  {
    id: 'TL-KNOWLEDGE-001',
    name: 'Dental Knowledge Library',
    description:
      'Plain-language explanations of conditions, treatments, procedures and care guides, plus dentists’ blog posts — written by Toothlogy-verified dentists and published only after another person’s clinical review (medical_reviewer). Clinical kinds cite sources; readers see only the reviewed version (revisions stay unpublished until approved); linked to the treatment catalogue (“find a dentist for this”); cover images through the file service; no links or contact details in the text; no HTML. Public, indexed, in the sitemap, with MedicalWebPage structured data. Archived, never deleted.',
    status: 'implemented',
    phase: 7,
    divisionId: 'TL-DIV-13-KNOWLEDGE',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-DENTIST-VERIFICATION-001', 'TL-CLINIC-CATALOGUE-001', 'TL-CORE-STORAGE-001'],
  },
  {
    id: 'TL-MARKETPLACE-PRODUCT-001',
    name: 'Businesses and Marketplace',
    description:
      'Dental businesses — supplier (vendor), manufacturer, distributor, wholesaler, retailer, laboratory — with a trading profile (categories, brands, stated GSTIN, delivery, minimum order, lab turnaround, districts served), a catalogue of products and services under a closed category list with indicative GST-inclusive prices, units and minimum orders, and quote requests as the marketplace’s leads: verified buyers ask, sellers quote a price valid up to 90 days, buyers accept or withdraw, expired quotes cannot be accepted. Not billed. Items a seller sells at a listed price can also be ordered (TL-MARKETPLACE-ORDER-001); equipment warranty and maintenance contracts are TL-EQUIPMENT-SERVICE-001.',
    status: 'implemented',
    phase: 9,
    divisionId: 'TL-DIV-16-MARKETPLACE',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CORE-MONEY-001', 'TL-INDIA-DATA-001'],
  },
  {
    id: 'TL-MARKETPLACE-ORDER-001',
    name: 'Orders, Tax Documents and Returns',
    description:
      'Product variants; a cart; orders to one seller at listed tax-inclusive prices, delivered to a district the seller serves; the seller confirms, declines and dispatches. The buyer pays the seller directly and the seller records what it received and refunded: Toothlogy moves no money, and online payment answers NOT_CONFIGURED until a provider is connected. Tax invoices and credit notes follow the seller’s country tax pack (India: CGST with SGST or UTGST within a state, IGST between states, HSN/SAC codes, April–March numbering), gapless per seller, kind and fiscal year. Returns within the seller’s window, with a credit note once the items are back.',
    status: 'implemented',
    phase: 9,
    divisionId: 'TL-DIV-16-MARKETPLACE',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-MARKETPLACE-PRODUCT-001', 'TL-CORE-MONEY-001', 'TL-PAYMENTS-GATEWAY-001'],
  },
  {
    id: 'TL-EQUIPMENT-SERVICE-001',
    name: 'Equipment, Warranty and Maintenance Contracts',
    description:
      'A practice’s equipment register (supplier, serial number, purchase, warranty); annual (AMC) and comprehensive (CMC) maintenance contracts that a service business proposes to a practice it has traded with and the practice accepts; preventive and breakdown visits counted against the contract; reminders before warranties and contracts end. Paid between the parties.',
    status: 'implemented',
    phase: 9,
    divisionId: 'TL-DIV-18-EQUIPMENT',
    pillars: ['TRUST'],
    dependsOn: ['TL-MARKETPLACE-PRODUCT-001', 'TL-MARKETPLACE-ORDER-001'],
  },
  {
    id: 'TL-PRIME-MEMBERSHIP-001',
    name: 'Prime Membership',
    description:
      'Prime plans that staff configure — audience, country, price per period with tax, bonus free leads, a labelled badge, priority support; none seeded, since the price and benefits are a business decision. An organization buys a period from its lead wallet (one ledger entry, net plus tax); renewal from the wallet at period end, once, or the period simply ends. Bonus leads are applied by lead billing after the standard free allowance; the badge never affects ranking (Constitution P3); priority tickets lead the support queue. Individual plans answer NOT_CONFIGURED until a payment provider is connected.',
    status: 'implemented',
    phase: 10,
    divisionId: 'TL-DIV-21-PRIME',
    pillars: ['TRUST'],
    dependsOn: ['TL-BILLING-WALLET-001', 'TL-LEADS-ENGINE-001'],
  },
  {
    id: 'TL-ENTERPRISE-001',
    name: 'Enterprise Groups and Agreements',
    description:
      'Groups one level deep (a chain or hospital group and its member organizations, linked by staff with a reason, audited). Enterprise agreements recorded by staff from the signed contract: term, support service levels (first response and resolution hours) stamped on every ticket from a covered organization and reported as met, breached or running; required data residency compared with the hosting region the deployment declares (TOOTHLOGY_HOSTING_REGION) — undeclared or different shows as not met; single sign-on required or not, shown as not met while the SSO port is NOT_CONFIGURED. The group sees its agreement, members and results. Contracts themselves are signed outside Toothlogy.',
    status: 'implemented',
    phase: 12,
    divisionId: 'TL-DIV-32-ADMIN',
    pillars: ['TRUST'],
    dependsOn: ['TL-GLOBAL-EXPANSION-001'],
  },
  {
    id: 'TL-TRIAGE-001',
    name: 'Concern Routing ("Which dentist?")',
    description:
      'Where to go for a dental concern, from fixed rules — not AI and not a diagnosis (Constitution §5). Safety questions first (breathing, spreading swelling, uncontrolled bleeding, head injury, fever with swelling → emergency care now, with the country’s emergency number); then the most urgent chosen concern decides within the hour / soon / routine, the kind of dentist to start with (a children’s dentist first for a child), the treatment pages to read, and a search for that kind of dentist (emergencies when it cannot wait). Runs in the browser: answers are neither sent nor stored. The rules await review by a clinical reviewer.',
    status: 'implemented',
    phase: 11,
    divisionId: 'TL-DIV-27-AI',
    pillars: ['DISCOVER', 'TRUST'],
    dependsOn: ['TL-CLINIC-CATALOGUE-001', 'TL-DISCOVERY-INDEX-001'],
  },
  {
    id: 'TL-RECOMMENDATIONS-001',
    name: 'Related Content',
    description:
      'Rule-based recommendations, labelled with why each is shown: under a reviewed article, up to three others on the same treatment, then the same field of dentistry, then the same kind; from the concern router, the treatment pages and the kind of dentist to search for. No model and no profile of the reader — everyone sees the same, and nothing ranks by it.',
    status: 'implemented',
    phase: 11,
    divisionId: 'TL-DIV-27-AI',
    pillars: ['DISCOVER'],
    dependsOn: ['TL-KNOWLEDGE-001'],
  },
] as const;

export const MODULE_BY_ID: ReadonlyMap<string, Module> = new Map(MODULES.map((m) => [m.id, m]));

export function getModule(id: string): Module | undefined {
  return MODULE_BY_ID.get(id);
}

export function modulesForDivision(divisionId: string): readonly Module[] {
  return MODULES.filter((m) => m.divisionId === divisionId);
}
