# Toothlogy Build Status

**Last verified:** 2026-09-11 (all-phase certification)
**Delivered through:** Phase 12 of 12. See the notes below: Phases 1–3 still have named gaps, and every external provider is a port that answers `NOT_CONFIGURED`.
**Enforced by:** `DELIVERED_THROUGH_PHASE` in [`src/registry/index.ts`](../src/registry/index.ts),
asserted by `tests/registry/registry-integrity.test.ts`

> This file states what actually works. Every 🟢 claim below was exercised
> against a real PostgreSQL database — and, where it has a screen, in a running
> browser — not inferred from the code. Constitution P9 makes overstating
> progress the most serious process violation in this repository.

> **About `DELIVERED_THROUGH_PHASE = 12`.** It was raised in steps on 2026-09-11,
> each after that phase's gate passed:
> - from 4 to 8 at the first final certification;
> - from 8 to 12 at the all-phase certification (see
>   [Verification results](#verification-results) and
>   [TEST-CERTIFICATION](TEST-CERTIFICATION.md)).
>
> The constant records the furthest phase whose gate passed. It does not mean
> every earlier phase is free of gaps: Phases 1–3 still list named open items.
>
> These are provider-independent ports that answer `NOT_CONFIGURED`, and no
> provider integration is claimed:
> - maps, the payment gateway and video;
> - email, SMS, WhatsApp and push;
> - the AI model and enterprise SSO.
>
> Triage rules carry **CLINICAL REVIEW REQUIRED**.

---

## Status vocabulary

| | Meaning |
|---|---|
| 🟢 IMPLEMENTED & VERIFIED | Working end to end, covered by tests, exercised against a real database |
| 🟡 EXTERNAL INTEGRATION PENDING | Our side works; no third-party provider is connected |
| 🟠 PARTIALLY IMPLEMENTED | Some of the phase's scope is built |
| 🔵 ARCHITECTED ONLY | Contract, port or schema exists; no behaviour |
| 🔴 NOT IMPLEMENTED | Not started |

---

## Phase summary

| Phase | Scope | Status |
|---|---|---|
| 0 | Constitution & architecture | 🟢 IMPLEMENTED & VERIFIED |
| 1 | Global platform core | 🟡 Our side built; email, SMS, push, payment, street-level maps and malware scanning have no provider |
| 2 | Toothlogy experience | 🟠 PARTIALLY IMPLEMENTED |
| 3 | Dentist + clinic ecosystem | 🟠 PARTIALLY IMPLEMENTED — most of the scope built; open items listed |
| 4 | Discovery + appointment engine (with leads, tiered lead billing, wallet/ledger and labelled Prime/Sponsored — see [PHASES](architecture/PHASES.md)) | 🟢 DELIVERED — maps, payment gateway and video are provider-independent ports answering `NOT_CONFIGURED` (🟡) |
| 5 | Trust + communication, with India operations: reviews, messaging, help desk, districts, extraction and pre-made accounts, outreach, camps | 🟢 DELIVERED 2026-09-11. Email, SMS and WhatsApp are ports (🟡); notifications are in-app |
| 6 | Patient health journey: dental record, access grants, prescriptions with QR check | 🟢 DELIVERED 2026-09-11 |
| 7 | Knowledge + research + community: reviewed articles, community Q&A, researcher and faculty profiles | 🟢 DELIVERED 2026-09-11 |
| 8 | Students + colleges + careers: colleges, courses, admissions, enrolment, jobs and internships | 🟢 DELIVERED 2026-09-11 |
| 9 | Marketplace: catalogue, variants, cart, orders, GST tax invoices and credit notes, returns, equipment warranty and AMC/CMC | 🟢 DELIVERED 2026-09-11. Buyers pay sellers directly; online payment is a port (🟡) |
| 10 | Prime + advertising + growth: leads and placement (from Phase 4), Prime membership, dashboards | 🟢 DELIVERED 2026-09-11. No plan seeded (a business decision); individual plans need the payment provider (🟡) |
| 11 | AI + IoT: connected equipment, AI summary and translation, triage routing, related content | 🟢 DELIVERED 2026-09-11. AI is a port (🟡); triage rules CLINICAL REVIEW REQUIRED |
| 12 | Global expansion + enterprise: country readiness, exchange rates, tax packs, groups, agreements, SLAs, residency | 🟢 DELIVERED 2026-09-11. SSO is a port (🟡); compliance packs are tax packs only |

---

## What works end to end

### 1. Patient / user account

```
register → session cookie → account dashboard → change password
→ two-step verification (TOTP + recovery codes) → review devices → revoke
→ request deletion → cancel deletion / restore within the grace period
```

🟢 Registration writes a user, credential, role assignment, profile,
preferences and an outbox event in one transaction. Login answers identically
for a wrong password and an unknown account. With TOTP enabled, a correct
password only sets a five-minute challenge cookie scoped to the MFA endpoint.

### 2. Organization and branches

```
create organization → administrator → add a branch (address, map position,
split-shift hours) → edit contact, address, facilities, access, home-visit
radius → temporary closure / holidays → invite a member → roles, removal,
ownership transfer
```

🟢 Cross-tenant authorization: a member of clinic A gets 403 on clinic B, and
every location, closure and service query is scoped by organization a second
time in the service, so an id from another clinic is simply not found. The owner
cannot be demoted or removed; ownership moves only by the owner's transfer.

### 3. Dentist credential verification — the TRUST pillar

```
dentist profile → qualification with council registration number → submit →
reviewer approves (2-year expiry) → still NOT public → claim practice →
still NOT public → clinic confirms → PUBLIC PROFILE LIVE → revoke → gone
```

🟢 A reviewer cannot approve their own application; a verified dentist is not
discoverable without a confirmed, locatable practice; closing or temporarily
closing their only branch removes them from search, and reopening restores it.

### 4. Services, prices and the public clinic page (2026-09-10)

```
clinic lists a catalogue treatment with price / range / "price on consultation"
→ public /clinics/:slug shows branches, hours, holidays, services, facilities
("as stated by the clinic" until verified) and confirmed discoverable dentists
```

🟢 Verified in the browser: a ₹800.00 scaling-and-polishing service created
from the form was stored as `priceMinor 80000 INR` with the catalogue's 45-minute
duration, and rendered on the public page. Rules enforced in the service, not
the form: catalogue treatments only; one active price per treatment per branch;
video only for consultations and triage; home visits only where a home-visit
radius is set; a dentist's own price only with a confirmed practice.

### 5. Organization verification (2026-09-10)

```
owner saves registration number → uploads certificate as the organization →
submits → reviewer sees organization, registration number, submitter, note and
documents → opens the certificate (signed URL) → approves → public page shows
"Verified clinic", becomes indexable, gains Dentist JSON-LD, enters the sitemap
```

🟢 Verified in the browser and database. A reviewer can read an evidence file
only while a pending request cites it — not every certificate on the platform,
and not after the decision (integration-tested both ways).

### 6. Clinic listing claims (API)

🟢 An unowned listing can be claimed with documents the claimant uploaded; the
claim is a verification request; approval makes the claimant owner and
administrator inside the review transaction, and a second competing claim is
refused with the listing left untouched. 🟢 The claim page is `/account/claim/:id`,
linked from the public page of an unclaimed listing (browser-tested 2026-09-11).

---

## Phase detail

### Phase 0 — Constitution & Architecture 🟢

Constitution, 35-division registry, ID scheme, plugin kernel, design system,
error taxonomy, RBAC, money, i18n, geo maths, event bus, feature flags.
Registry integrity is machine-checked.

### Phase 1 — Global Platform Core 🟡

**Built:** 51 tables over 8 migrations; authentication (registration, login,
sessions, lockout, password reset and change, email and phone verification,
TOTP two-step verification with recovery codes, deletion with a grace period
and restoration, security activity log); preferences, consent (append-only),
saved places, data export; organizations with hierarchy, verification,
ownership and roles; secure files (purpose policy, content sniffing, signed
short-lived URLs, access log, retention-aware purge, local-disk adapter);
Postgres full-text search with synonyms, typo tolerance, facets and radius;
city-level reference geocoding labelled as such; notifications with category
preferences, quiet hours and per-channel templates; transactional outbox with
durable handlers, retries and dead-lettering; a job runner.

**External, not faked:** email, SMS, WhatsApp, push, payment, street-level
maps, malware scanning, analytics and error tracking have ports and honest
`NOT_CONFIGURED` failures but no configured provider. In-app notifications are
the only channel that delivers today.

### Phase 2 — Toothlogy Experience 🟠

**Built:** application shell, themes (light/dark/system) with palettes, high
contrast and reduced motion applied before first paint; PWA (manifest, icons,
service worker that never caches pages or API, offline page); account centre
(profile, preferences, notifications, privacy, security, organizations); SEO
foundations (robots, sitemap from the page registry plus discoverable dentists
and verified clinics, canonical and Open Graph tags, structured data).

**Admin console:** 18 staff screens under `/admin` (verification, data,
operations, billing, campaigns, camps, colleges, community, reviews,
knowledge, support, analytics, Prime, countries, exchange rates, enterprise).

**Accessibility:** every public page is scanned by axe-core against WCAG 2.1 A
and AA in the browser suite (`tests/e2e/accessibility.spec.ts`); serious and
critical violations fail it.

**Not built:** locale-prefixed routing 🔵 (flag exists, off); visual
regression testing 🔴.

### Phase 3 — Dentist + Clinic Ecosystem 🟠

**Built:** dentist profiles, qualifications, specialties, languages and fees;
the verification lifecycle and review queue (dentists, organizations and
listing claims); practice claims with clinic confirmation; practice booking
settings by the dentist or the clinic; a 36-treatment catalogue and clinic
offerings; branch creation and editing (contact, address, map position,
split-shift hours, facilities, capacity, access, home visits, temporary
closure) and holidays; organization verification submission with document
upload; public dentist and clinic pages, each linking to the other.

**Not built / open:**

- 🟢 Listing-claim page (`/account/claim/:id`): role, documents uploaded as
  oneself, note → an ORGANIZATION_CLAIM verification request (2026-09-11).
- 🟢 Clinic logo and branch photos (up to 12 per branch) uploaded from the
  organization page and shown on the public clinic page (2026-09-11).
- 🟢 Organization profile editing on the organization page: name,
  description, website, phone, email, tax identifier (changing it on a
  verified organization says it must be verified again) (2026-09-11).
- 🟢 Dentist dashboard analytics (`/account/dentist-profile/analytics`): the
  dentist's own bookings and outcomes, reviews, profile views and most-booked
  services across their practices, over 7, 30 or 90 days (2026-09-11).

### Phase 4 — Discovery + Appointment Engine 🟢 (delivered 2026-09-10)

**Delivered** — registry status `implemented`, exercised against PostgreSQL and in a browser:

- 🟢 **Discovery indexer.** One search document per confirmed practice at an
  active, located branch, published only while the dentist is discoverable;
  clinics indexed only while currently verified. Triggered by the
  discoverability authority and by branch and service changes; the
  `search.reindex` job rebuilds everything (run through the jobs endpoint:
  0 dentists, 1 clinic published in development data, 789 ms). The ranking
  input is a 0–1 merit score; nothing reads spend. Integration-tested.
- 🟢 **`/find`.** Dentist and clinic search by text, place or "use my
  location" (permission asked only on click, rounded to ~100 m, stored
  nowhere), radius, specialty, language, treatment, appointment type,
  emergency and fee. Organic results only; the "Sponsored" label is wired to
  the `promoted` flag for when paid placement exists. Works without
  JavaScript. Verified in the browser.

**Search limit, by design:** typo tolerance matches a one-position letter
swap ("smiel" → Smile) but not a letter moved two places ("smlie"), which
falls below the 0.45 title-similarity threshold chosen for precision.

- 🟢 **Availability engine.** Slots are generated deterministically from the
  database: clinic opening hours, dentist weekly sessions (split shifts; the gap
  is the break), public holidays (per branch opt-in), temporary closures,
  dentist leave and blocks, service duration, buffer, minimum notice and
  booking window, existing appointments (dentist busy until
  `occupiedUntil`), chair capacity, branch timezone, and eligibility for
  clinic / video / home-visit (radius) / emergency. Clinic visits need the
  dentist's session *and* the clinic open; video and home visits follow the
  dentist's sessions. Past slots are never returned. APIs: dates, slots,
  validate, rules, exceptions. Unit-tested (16) and integration-tested.
- 🟢 **Booking and double-booking protection.** One transaction: row locks on
  the branch and dentist, a re-check of the slot, then the insert; a
  PostgreSQL `EXCLUDE` constraint (`appointments_no_dentist_overlap`) refuses
  overlapping active appointments even if the service is bypassed. The
  Idempotency-Key is stored per patient, so a retry or double submit returns
  the same appointment. Instant or request booking per practice; family
  members (dependents); rebooking always revalidates.
- 🟢 **Appointment lifecycle.** REQUESTED, PENDING, CONFIRMED, CHECKED_IN,
  IN_PROGRESS, COMPLETED, CANCELLED, REJECTED, NO_SHOW, EXPIRED through one
  transition table: who may act, from which states, guarded update (no
  double processing), event row, audit record, outbox event. Reschedule
  (patient limit 3; a practice move needs a reason and the patient's
  acceptance), cancellation with reasons, request expiry. Reminders are four
  separate kinds — tomorrow, today (from 07:00 local), soon (within 2 h) and
  follow-up due — each recorded in `appointment_reminders` under a unique
  (appointment, kind, time) key and claimed under a row lock, so concurrent
  jobs send once, cancelled or completed visits are never reminded, and a
  moved appointment is reminded for its new time.
- 🟢 **Practice calendar.** Month, week and day views per practice:
  appointments with status, patient, service and type; sessions and clinic
  hours; leave, blocks, holidays and closures; each appointment opens its
  detail. Server-rendered; a list of days on a phone (checked at 375 px).
- 🟡 **Video consultations.** Bookable as a time. A `VideoPort` and
  `video_meetings` model (provider, meeting id, participant and host links,
  start, expiry, cancellation) follow the appointment through confirm,
  reschedule and cancel — proven with a test adapter. No provider is
  connected: no meeting is written and no link is shown; the screens say the
  clinic sends its own.
- 🟢 **Waitlist.** Preferences (date range, time of day, type); a freed slot
  is held for one waitlisted patient at a time under the same locks, with an
  expiry; a lapsed hold is not re-offered to the same patient.
- 🟢 **Lead engine.** Booking and callback leads; a configurable, versioned
  qualification rule in its own service (verified contact; bookings qualify
  on confirmation; duplicate window 30 days), each decision recorded with its
  reason, time and rule version; deterministic de-duplication. Callback
  contact details stay hidden from the practice until the lead is paid for.
- 🟢 **Tiered lead billing, wallet and ledger** (business decision of
  2026-09-10, superseding the launch ₹90 rule). Configuration only, in
  `lead_pricing_rules`: each organization's first 30 qualified leads are
  free; from the 31st, ₹50 + 18% GST (5,000 + 900 = 5,900 paise); minimum
  recharge 20 paid leads (₹1,000 + ₹180 = ₹1,180); low-balance warning below
  3 paid leads. Each qualified lead takes the organization's next
  `billingOrdinal` under the wallet lock (unique per organization), then is
  FREE or charged. Duplicate, declined, unverified, internal (staff) and
  configured test-domain leads are never billed. Prepaid wallet per
  organization; every balance change is an append-only ledger entry; a
  `CHECK` forbids a negative balance. Charge, credit, refund, reversal and
  dispute are idempotent; a credit key is unique across every wallet.
  Insufficient funds leaves the lead `PENDING_FUNDS`, charged exactly once
  after the next credit. Recharges below the minimum need an explicit,
  audited staff override. Card/UPI recharge answers `NOT_CONFIGURED`.
- 🟢 **Statements.** A statement of account for any date range — opening and
  closing balance, credits, lead charges (price and GST apart), refunds,
  reversals, GST totals, free/paid/waiting lead counts — recomputed from the
  ledger and checked to reconcile. Always labelled "not a GST tax invoice";
  issued monthly statements are numbered `STM-…`.
- 🟢 **Notifications** through the outbox: appointment requested, confirmed,
  declined, cancelled, rescheduled, checked in, completed, reminders and
  follow-ups; lead billed (free / charged / waiting for funds) and delivered;
  wallet recharge, credit, refund and low balance. In-app is delivered; email,
  SMS, WhatsApp and push record FAILED or SKIPPED — never delivered — because
  no provider is connected.
- 🟢 **Prime / Sponsored placement.** Prime dentist, Prime clinic and Prime
  hospital campaigns in clearly labelled **Sponsored** slots on `/find` and on
  other dentists' and clinics' profiles, in their own section — organic
  ranking never reads campaigns, and tests show organic results identical with
  and without one. Targeting by distance (the existing `Geofence` model),
  treatment and appointment type; shown only while ACTIVE, within dates,
  funded, eligible (verified, confirmed, not paused) and bookable for the
  searched type; one slot per promoted thing. Billing through the wallet
  ledger: activation holds the budget (refused, with nothing written, when the
  wallet cannot cover it); each running day is charged once (unique day row;
  a CHECK forbids spend beyond the hold); ending, exhaustion or cancellation
  refunds the unspent part once. Clicks are counted once per impression and
  never charged; the promoted organization's own views and clicks are recorded
  as excluded. Attribution carries a click to the booking and its lead;
  analytics (impressions, clicks, profile views, booking clicks, leads,
  conversions, spend, cost per lead, remaining) sit beside organic leads, never
  added to them. Practice console (create with preview, activate, pause,
  resume, cancel, add budget, targeting) and staff console; every action
  audited. The minimum daily budget (₹100) and slot counts are configuration
  (`sponsored_placement_settings`), confirmable by the business.
- 🟢 **Screens.** Booking flow, slot picker, patient appointments and detail
  (with bookable alternatives: other dentists at the clinic with free times,
  and searches that keep the treatment and place), practice dashboard,
  calendar and appointment detail, availability editor, leads (total, free,
  paid, waiting, delivered, completed, converted, rejected, duplicate, spend,
  GST, wallet, visit rate and conversion rate apart), wallet with recharge
  quote and statements, staff billing console. `/find`, dentist and clinic
  pages show Book only where a real free slot exists, with that slot.

**Browser/API end-to-end run, 2026-09-10, development database** — through
the real APIs and screens, not direct database writes, except two setup steps
stated here: the patient's email was marked verified (no email provider is
configured, so no token can arrive) and a staff account was given
`platform_admin` (there is no role-grant screen).

```
Dentist profile submitted → approved by a moderator → practice confirmed → reindex: 1 dentist published
/find (server-rendered): Book link + "Next free: Fri, 11 Sept, 09:00" (clinic hours, real diary)
Patient: VIDEO slots today 21:00–23:00 from the evening session; CLINIC none (clinic closed)
Book → REQUESTED; same Idempotency-Key replayed → same appointment
Two other patients on the taken slot → 409 CONFLICT, 409 CONFLICT
Simultaneous race for a free slot → 200, 409; past slot → 400; overlapping active rows: 0
Practice screen: Confirm → Check in → Start → Complete (follow-up in 180 days)
Lead: CREATE → QUALIFY → CHARGE_DEFERRED (wallet 0) → DELIVER → ACCEPT → APPOINTMENT
Staff credit ₹500 (NEFT reference); key replay → same entry; no key → 400
→ lead charged once: −₹106.20 (₹90 + ₹16.20 GST), balance ₹393.80 → COMPLETE → CONVERTED (leads screen)
Callback from the same patient → DUPLICATE, not billed, contact hidden
Notifications: in-app DELIVERED; email FAILED (no provider); SMS/WhatsApp/push SKIPPED by preference
```

(That run predates the 2026-09-10 tiered pricing, which is why its charge
was ₹90; the ledger keeps it as recorded.)

**Browser end-to-end (Playwright, real Chrome), 2026-09-10** —
`tests/e2e/patient-and-practice.spec.ts`, 2 passed in 3.6 min against the
development server:

```
Patient: register (form) → /find?appointmentType=VIDEO → dentist profile → Book → Consultation,
         Video, first free time → request sent → appointment → Change time → Cancel (reason)
         → Book again (revalidated) → request sent            [1 fixture step: email marked verified]
Practice: sign in → dashboard shows the request → Confirm → Check in → Start → Complete
Lead:    QUALIFY → BILLED_FREE (lead 2 of 30) → DELIVER → ACCEPT → APPOINTMENT → COMPLETE → CONVERTED
         (the cancelled first request's lead: LOST, not billed); patient in-app notifications checked
```

**Phase 4 gate (as instructed on 2026-09-10) — passing through real code:**
search → discovery → availability → booking → appointment → confirm →
check-in → start → complete → qualified lead → first 30 free → 31st at ₹50 →
wallet → GST → delivery → conversion.

**Phase 4 gate — passed; `DELIVERED_THROUGH_PHASE = 4`.** Every item of
Phase 4's documented scope ([PHASES.md](architecture/PHASES.md)) is built
and tested, with three provider-dependent parts delivered deliberately as
provider-independent ports:
- 🟡 **Maps** — geocoding and distance/radius search work on the reference
  geocoder; map tiles and routing sit behind `GeocodingPort`
  (`TL-INT-MAPS-001`), `NOT_CONFIGURED`.
- 🟡 **Payment gateway** — `PaymentPort` with mandatory idempotency and webhook
  verification (`TL-PAYMENTS-GATEWAY-001`, still `prepared`); card/UPI recharge
  answers `NOT_CONFIGURED`, and staff-recorded bank transfers are the only
  working credit.
- 🟡 **Video** — `VideoPort` and `video_meetings`; `NOT_CONFIGURED`, so no
  meeting or link is ever shown.
No provider integration is claimed for any of them.

**Other open items:**
- After a completed visit the patient's "visit complete" notice invites a
  rating on the appointment page, where reviews (Phase 5) are written
  (2026-09-11).
- Statements are not GST tax invoices: Toothlogy would need its own GSTIN and
  invoicing registration, a business step. Monthly statements are issued by
  the `billing.statements` job (last month, once per wallet) as well as on
  demand (2026-09-11).
- Video consultations book a time only until a video provider is connected.
- The tax treatment of prepaid recharges (GST levied per paid lead, not on
  the recharge) should be confirmed by an accountant.
- Labelled Prime/Sponsored placement is built (campaigns with budget hold,
  daily accrual and refund, the Sponsored slot on `/find` and profiles),
  browser-tested in `sponsored.spec.ts`.

### India data — districts, extraction, pre-made accounts (Phase 5 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 5 passes its gate.

- **Geography.** Country → State/UT → District; the district is the operational
  unit. Chhattisgarh's 33 districts are seeded with alternative spellings; the
  national list is imported from the Local Government Directory export on
  `/admin/data` (idempotent; a new spelling becomes an alias, never a second
  district). Cities and branches carry their district.
- **Extraction.** Operators import CSV rows (`/admin/data`, or the API). Each row
  is kept exactly as received beside its normalized form (names, +91 mobiles,
  emails, PIN codes, registrations), with source, extraction date, district,
  a confidence score and a deterministic dedupe key; it is checked against rows
  in the same batch, earlier batches, accounts, dentist registrations and
  listed organizations. What could not be parsed is listed for the reviewer.
  Every record stays **UNVERIFIED**.
- **Pre-made accounts.** A reviewed dentist row becomes an inactive
  (`PENDING_ACTIVATION`) account with a draft, non-discoverable profile — only
  with both email and mobile, because activation proves both. It cannot sign
  in. A clinic, hospital or college row becomes an unowned, pending listing in
  its district, taken over through the existing evidence-based claim review;
  approval marks the record CLAIMED.
- **Activation** (`/activate`). Email + mobile → a single-use link by email and a
  code by SMS; the answer is the same whether or not a profile matches. Code +
  password + terms → ACTIVE, email and phone verified. The same person is
  never given a second account.
- **Not configured.** Automatic extraction from an external source
  (`TL-INT-EXTRACTOR-001`) — nothing is scraped. Email and SMS delivery need
  their providers: until then activation messages are not delivered, and
  nothing claims they were.

### Operations — lead work, outreach, district command centre (Phase 5 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 5 passes its gate.

- **Lead work (practice).** An administrator assigns an open lead to a member
  of the practice. The assignee, an administrator or the lead's dentist logs
  calls with their outcome, adds notes and schedules the next follow-up —
  all as lead events beside the status history, not a second table. A call
  can only be logged once the patient's number is visible (a booking, or a
  free or paid callback); a connected call on an accepted lead marks it
  contacted. A due follow-up sends one in-app reminder (job
  `leads.follow-ups`, claimed per follow-up time) to the assignee, or to the
  administrators when nobody is assigned. Filters: assigned to me, follow-ups due.
- **Outreach (Toothlogy).** Tasks for an extracted record or an organization —
  invite a pre-made dentist to activate, an owner to claim a listing, check
  low-confidence details, help a live practice. One open task per subject
  (unique open key; the database also refuses a task without exactly one
  subject). Leads open outreach for a whole district, round-robin between
  operators, never doubling a subject; operators see their own and the
  unassigned tasks, and logging on an unassigned one takes it. Calls, visits,
  messages and notes are append-only activities.
- **Activation invitations** go through the real activation flow and are
  refused (`NOT_CONFIGURED`) while email or SMS is not connected.
- **District command centre** (`/admin/operations`): per district, records,
  pre-made and activated dentists, unclaimed and claimed listings, live
  clinics, 30-day leads and bookings, open and overdue outreach; per operator,
  open, overdue, done and calls in 7 days — counted from the rows.
- **Not done, deliberately.** No automated marketing to extracted contacts:
  they never consented. No telephony integration: calls are made by people
  and logged.

### Reviews and ratings (Phase 5 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 5 passes its gate.

- **Tied to real visits**: only the patient of a completed appointment reviews
  it, within 90 days, once — from the appointment's page ("Rate this visit").
  1–5 stars (a real radio group) and optional text; phone numbers and email
  addresses refused (the shared rule, also used by the community). Editable
  for 30 days, removable (text cleared) at `/account/reviews`.
- **Practice side** (`/account/practice/reviews`): the practice's
  administrators or the treating dentist reply once in public (editable), and
  may flag a review for a moderator — it stays up until one decides.
- **Moderation** (`/admin/reviews`): keep, hide with the reason the patient is
  told, or restore.
- **Public** (dentist page): reviewers shown as first name and initial, visit
  month and service; the practice's reply; an average only from three
  reviews, the count before that. Notifications: review received (practice
  and dentist), reply and moderation (patient).

### Messaging and help (Phase 5 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 5 passes its gate.

- **Patient ↔ practice messages** (`/account/messages`, `/account/practice/messages`):
  a patient writes only to a practice they have an appointment with — from the
  appointment page ("Message the practice about this appointment") or the
  inbox. One open conversation per patient, practice and appointment; unread
  marked on each side; 30 messages a day per person. Practice administrators
  and staff read and reply; either side may close. Notifications name who
  wrote — never the text (a message may carry health details).
- **Help** (`/help`, now a real page): signed-in people ask Toothlogy's team by
  category (account, booking, billing, verification, data, other), optionally
  on behalf of an organization they belong to; 5 a day. `/help/tickets/:id`:
  the conversation; staff reply (the requester is told), add internal notes the
  requester never sees, resolve, reopen and assign; the requester replies or
  closes. `/admin/support`: open and waiting, mine, resolved, closed.
- No chat provider, SMS or email is sent that is not configured — notices are
  in-app and through the email port (NOT_CONFIGURED until a provider is set).

### Dental record and prescriptions (Phase 6 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 6 passes its gate.

- **The patient's record** (`/account/records`): treatments, visit notes, X-rays,
  reports and documents, with FDI tooth numbers, for the account holder or a
  family member. The patient always sees everything — their own entries and
  every practice's, including after a practice's access ends — and may delete
  what they added themselves. Files go through the file service (content
  sniffed, scanned where a scanner is configured, 60-second signed links for
  clinical files) and belong to the patient whoever uploaded them.
- **Sharing is the patient's decision**: a practice they have an appointment
  with asks (`/account/organizations/:id/patients`), or the patient shares
  directly — read only or read and add; 30 days, a year or until withdrawn.
  Each active share carries a CLINICAL_DATA_SHARING consent; withdrawing (or
  expiry, by the `records.expire-grants` job) ends access at once and marks the
  consent withdrawn. Without a share, a practice cannot tell a record exists.
- **Every look is visible**: each time a practice opens the record, and each
  file it opens, appears under "Who looked" for the patient.
- **Practice side** (`/account/organizations/:id/patients/:userId`): read, add
  entries and files under a read-and-add share, retract the practice's own
  entries with a reason the patient sees — never edit or delete them. A new
  organization role, **Clinician**, carries this; front-desk Staff do not see
  clinical records. Link from the practice's appointment page.
- **Prescriptions**: only a dentist whose credentials Toothlogy has verified,
  under a read-and-add share. `/prescriptions/:id` prints or saves as PDF via
  the browser (nothing leaves the device) with a QR code; a pharmacist checks
  it at `/rx/:code` (80-bit code; shows validity, date, prescriber, practice,
  the patient's first name and initial, the medicines). Cancelled with a
  reason, never edited.
- In the personal-data export; on erasure, open shares end and entries stay
  under clinical retention. Notifications say who, never what.
- **Treatment plans** (2026-09-11):
  - A practice proposes up to 20 treatments, with teeth and tax-inclusive
    estimates, under a read-and-add grant.
  - The patient accepts or declines, once.
  - The practice records each treatment done, or not done with a reason; the
    plan completes exactly once, even under concurrent updates.
  - The practice can withdraw a plan, with a reason the patient sees.
  - Plans stay in the patient's record and export, and appear in "who looked".
- Not built:
  - e-prescribing to pharmacies, which needs a pharmacy network integration;
  - DICOM viewing in the browser (DICOM files download).

### Market opening and enterprise (Phase 12 work, 2026-09-11) 🟢

Delivered with Phase 12. Exchange rates, tax packs and agreements are under
[Phases 9–12](#phases-912-).

- **Opening a country is configuration** (`/admin/countries`, platform
  administrators): every modelled country with its readiness — currency,
  default language switched on, time zone, regions loaded, a standard lead
  price with its tax rate. A country opens only when all pass; closing one
  stops new organizations there while existing ones carry on. Organization
  creation now honours this switch (it previously accepted any modelled
  country). India is open; the other modelled countries are closed and show
  what they lack.
- **Money across currencies**: never added together and never converted with
  a made-up rate. Platform lead revenue is shown per currency; each practice's
  spend in its own wallet's currency.
- **Enterprise sign-in** (OIDC/SAML): a port that answers NOT_CONFIGURED; the
  sign-in page offers nothing until a provider is connected. Contracts, SLAs
  and data residency are commercial and hosting decisions, not code here.

### Connected equipment (Phase 11 work, 2026-09-11) 🟢

Delivered with Phase 11.

- **`/account/organizations/:id/devices`**: a practice registers autoclaves,
  chairs, compressors, suction units, X-ray units, waterlines and medicine
  refrigerators. Each device gets its own token, shown once (Toothlogy keeps
  only a fingerprint), with the exact request the device sends. Re-key or
  retire at any time; history stays.
- **Readings** arrive over HTTPS with `Authorization: Device <token>` — up to
  100 at a time; the first marks the device connected. The practice sets an
  acceptable range per reading; a reading outside it, or a fault code, opens
  an alert and tells the administrators. One open alert per device and
  reading; a later normal reading does not clear it — a person resolves it
  with a note of what was done.
- Front-desk staff and clinicians see equipment; administrators change it.
  No device vendor integration is claimed: any device (or a small gateway)
  that can make an HTTPS request can report.

### Analytics (Phase 10 work) and AI under the covenant (Phase 11 work), 2026-09-11 🟢

Delivered with Phases 10 and 11. The AI port is `NOT_CONFIGURED` (🟡).

- **Practice analytics** (`/account/organizations/:id/analytics`, for
  administrators): bookings made, visits completed, no-shows, cancellations
  and the attended rate; leads through qualification, booking and treatment,
  how many were free, charged or refunded, and what leads cost less refunds;
  reviews; dentist profile and clinic page views; most-booked services; a
  per-day chart — over 7, 30 or 90 days. **Platform analytics**
  (`/admin/analytics`, platform administrators): accounts, verified dentists
  and organizations, bookings, completed visits, searches, active record
  shares, lead revenue, reviews, articles, open postings, applications and
  support. Every number is counted from the records; nothing estimated; a
  rate with nothing to divide by shows “—”.
- **View recording**, found missing and added: dentist profile views, clinic
  page views and searches. A signed-in person is told apart (by a keyed
  hash, never their identity) only if they agreed to analytics; otherwise the
  event is anonymous. A search records its shape, never the words.
- **AI**: the port exists and answers NOT_CONFIGURED — no model is connected.
  The one use allowed is a labelled plain-language summary of a published,
  clinically reviewed article, under a fixed instruction that forbids advice
  and diagnosis; only public reviewed text is ever sent; each call is audited
  without the text. The article page offers it only when a provider is
  configured, so nobody meets a button that can only fail.

### Internships and careers (Phase 8 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 8 passes its gate.

- **`/careers`**: jobs and internships at dental organizations, searchable and
  filtered by kind, role and district; each posting's page carries JobPosting
  structured data while it is open, and open postings are in the sitemap.
  Pay is shown as stated by the employer (“stated, not checked”).
- **Employers** (`/account/organizations/:id/careers`): post as a draft,
  publish only once Toothlogy has verified the organization, close, mark
  filled; postings close themselves after their date. No phone numbers,
  emails or links in a posting — people apply through Toothlogy.
- **Applying**: signed in with a verified email, once per posting, with a
  résumé (PDF or Word) and a note, agreeing to share name, email and phone
  with that employer only. `/account/applications` shows where each stands.
- **Working applications**: shortlist, invite to interview (with a time),
  offer, hire or not take forward — the applicant is told each move, with an
  optional message; internal notes stay with the employer. The employer opens
  the résumé only while the application stands; a withdrawal takes back the
  contact details, résumé and note.
- **`/for-dentists` and `/for-clinics`** — the last placeholder pages — now say
  what Toothlogy does as built, each point linked to where it happens; lead
  pricing is read from the configured rule, never typed into the page.

### Dental knowledge library (Phase 7 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 7 passes its gate.

- **`/knowledge`** (the placeholder is gone): plain-language articles on
  conditions, treatments, procedures and care guides, and dentists' blog
  posts. Search by title, summary or treatment; filter by kind; not indexed
  while empty. **`/knowledge/:slug`**: who wrote it (linked to their public
  profile), who clinically reviewed it and when, reading time, its sources,
  “find a dentist for this treatment” when it explains one, and MedicalWebPage
  structured data. In the sitemap.
- **Writing** (`/account/articles`): dentists whose credentials Toothlogy has
  verified. Clinical kinds must cite at least one source; links belong in the
  sources, never the text; no phone numbers or email addresses; the text is
  plain (headings and lists by simple markers), never HTML. Optional cover
  image through the file service.
- **Review** (`/admin/knowledge`): a new role, **Medical Reviewer**, publishes
  or asks for changes with a note — never on their own article (also a
  database constraint). Readers only ever see a reviewed version: revising a
  published article leaves the reviewed one up until the revision is
  approved. Archiving takes an article off the site; nothing is deleted.
  Authors are notified of each decision.
- Research papers and the community Q&A (the rest of Phase 7) were built
  earlier: see “Researchers, faculty and community”.

### Researchers, faculty and community (Phase 7 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 7 passes its gate.

- **Researchers and faculty** (`/account/academic`, `/academics`,
  `/researchers/:slug`, `/faculty/:slug`): a researcher profile, a faculty
  profile (new profile type), or both — headline, designation, department,
  institution, ORCID (format checked), interests from the specialty list,
  website, publications with DOIs. All labelled as the person's own
  statement; public only when they choose. Faculty ask a college to confirm
  their post; its administrators confirm, decline or end it
  (`/account/organizations/:id/faculty`), and only a confirmed post is shown —
  on the profile and on the college's page.
- **Community** (`/community`): questions and answers under a closed list of
  topics, from signed-in members with a verified email, 5 questions and 30
  answers a day. Not medical advice, and every page says so; phone numbers
  and email addresses are refused in public posts. Verified dentists' answers
  carry a badge and come first after the accepted one; the asker marks the
  answer that helped. Authors remove their own posts (text cleared). Anyone
  may report a post once; three open reports hide it pending review;
  moderators hide with a reason the author is told, or restore
  (`/admin/community`). Community pages are not indexed.
- **Not done, deliberately.** The dental knowledge library (`/knowledge`,
  sourced articles with citations) remains Phase 7 work and says so.

### Businesses and marketplace (Phase 9 work, 2026-09-11) 🟢

Delivered with Phase 9.

- **Businesses**: organizations of type supplier (vendor), manufacturer,
  distributor, wholesaler, retailer or dental laboratory (the last three are
  new types). A trading profile — categories from a closed list, brands,
  GSTIN (format checked; stated unless the organization is verified), year,
  delivery and minimum-order notes, lab turnaround, and the districts served
  (or all of India).
- **Catalogue**: products and services (goods, lab work, maintenance) with an
  indicative GST-inclusive price, unit, GST rate and minimum order; draft →
  published → archived. Public `/marketplace` (by category, district served,
  name or brand) and `/suppliers/:slug`; businesses nobody manages list
  nothing.
- **Quote requests** — the marketplace's leads: signed-in buyers with a
  verified email, optionally for their clinic, never at their own business,
  at least the minimum order, one open request per product. The seller
  quotes a total valid up to 90 days (revisable) or declines with a reason;
  the buyer accepts or withdraws; an expired quote cannot be accepted (job
  `marketplace.expire-quotes`); the seller closes it once fulfilled.
  Notifications both ways. Not billed.
- Variants, cart, orders, tax documents, returns and equipment maintenance
  contracts followed later the same day — see
  [Phases 9–12](#phases-912-).

### Dental camps (Phase 5 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 5 passes its gate.

- **Organize** (`/account/camps/new`): dentists, clinic administrators, the new
  Camp Organizer role and staff plan a camp — district, venue, India-time
  dates (at most three days), places, services — optionally for an
  organization they manage. Draft → submitted → approved or rejected (with a
  reason) → completed or cancelled. **Only staff approve, never their own
  camp**; nothing unapproved is public (`/camps`, `/camps/:slug`).
- **Doctors**: verified dentists apply; the organizer confirms or declines;
  attendance is recorded — each dentist's participation history.
- **Patients**: register themselves when signed in, or are recorded at the
  venue as walk-ins; one registration per phone and per account per camp;
  capacity is enforced under a row lock (two people racing for the last place:
  one gets it). Consent covers the camp's organizer and doctors only.
- **Visit → referral → lead → appointment**: the organizer or a camp doctor
  records findings and may refer the patient to a camp doctor. The patient
  follows up with "ask the dentist to call" or a booking — the ordinary
  callback and booking flows, same qualification and pricing — and within 90
  days both are attributed to the camp visit. Walk-ins without an account
  cannot become platform leads; their referral stays with the camp's doctors.
- **Console** (`/account/camps/:id`) for the organizer, staff and confirmed
  doctors: status, numbers (registered, attended, no-shows, walk-ins,
  follow-ups, referrals, attributed leads and appointments), doctors and
  patients. Staff review at `/admin/camps`. Notifications are in-app.

### Enrolment — the end of the admission funnel (Phase 8 work, 2026-09-11) 🟢

- A college enrols a student it admitted — academic year, an optional roll
  number (unique within the course and year), start date — from the admitted
  enquiry on its Admissions page. The college's roll
  (`/account/organizations/:id/students`, administrators only) filters by
  course, year and status; an enrolment is marked completed, or withdrawn
  with a reason. The student is told each step and sees their enrolments
  under My admissions. A record of study, not a certificate.

### Page Content Security Policy (2026-09-11) 🟢

- Every HTML page now carries a nonce-bound Content Security Policy
  (`src/proxy.ts`): only scripts carrying the per-request nonce run, so an
  injected script does nothing even if it reaches a page. Production adds
  `'strict-dynamic'` and `upgrade-insecure-requests` and never allows
  `'unsafe-eval'`. Found at the certification security gate: the policy
  builder had existed without being applied.

### Education — colleges, courses, admissions (Phase 8 work, 2026-09-11) 🟢

Built and tested; held at `prepared` in the registry until Phase 8 passes its gate.

- **Colleges** are organizations of type COLLEGE with an academic profile:
  ownership, affiliated university, year, admissions contact, and stated
  recognition (body and reference). Recognition shows as the college's own
  statement until Toothlogy staff check it (`/admin/colleges`); changing it
  clears the check.
- **Courses**: BDS, MDS (specialty from the reference list — no free text),
  diploma, certificate, fellowship, PhD; duration, seats, fee per year (paise),
  entrance exam (NEET-UG, NEET-MDS, INI-CET, the college's own, none); draft →
  published → archived. **Admission windows** per academic year (one per
  year, validated), shown as upcoming, open or closed in India's timezone.
- **Public pages** `/colleges` (by level and state) and `/colleges/:slug`:
  published courses of claimed colleges only; an unclaimed listing says so
  and shows none; indexable only when the college is verified.
- **Admission enquiries** (a college's admission leads): signed-in students
  with a verified email, with consent to be contacted, about a published
  course; never at their own college; one open enquiry per course. The
  college works them — contacted, applied, admitted / not admitted, closed —
  with assignment, notes and follow-ups (`/account/organizations/:id/admissions`);
  students follow and withdraw them (`/account/admissions`). Both sides are
  notified in-app and by email (email needs its provider).
- **Not done, deliberately.** Enquiries are not billed — no price for colleges
  has been decided. Applications, fee payment, seat allotment and counselling
  results stay with the colleges and counselling authorities.

### Phases 9–12 🟢

Built 2026-09-11 after "complete remaining phases in one go". Migrations 25–27,
all additive. The pieces already described above (marketplace quotes, analytics,
AI summary port, connected equipment, country readiness) are not repeated here.

- **Phase 9 — orders, tax documents, returns** (TL-MARKETPLACE-ORDER-001).
  - Product variants, and a cart grouped by seller.
  - An order goes to one seller at listed tax-inclusive prices, delivered to a
    district that seller serves. The seller confirms, declines, dispatches or
    cancels with a reason.
  - The buyer pays the seller directly, and the seller records what it received
    or refunded, never more than is due. Toothlogy moves no money. "Pay online"
    goes through the payment port and answers `NOT_CONFIGURED`, and it never
    marks an order paid.
  - Tax invoices and credit notes come from the seller's country tax pack
    (`src/platform/tax/packs.ts`). For India: CGST plus SGST (UTGST in union
    territories) within a state, IGST between states, HSN/SAC codes, and an
    April–March fiscal year. They are numbered without gaps per seller, kind
    and year, from a counter taken inside the issuing transaction.
  - Returns within the seller's window; the credit note is issued once the
    items are received back.
- **Phase 9 — equipment, warranty, AMC/CMC** (TL-EQUIPMENT-SERVICE-001).
  - A practice's equipment register: serial number, purchase date, warranty.
  - Maintenance contracts that a service business proposes only to a practice
    it has traded with, and the practice accepts, choosing the equipment
    covered.
  - Preventive visits counted against the contract (under a row lock), and
    breakdown calls.
  - Reminders before a warranty or contract ends (job `equipment.reminders`).
- **Phase 10 — Prime membership** (TL-PRIME-MEMBERSHIP-001).
  - Plans are staff configuration and none are seeded: audience, country,
    price and period with tax, bonus free leads, badge, priority support.
  - An organization buys a period from its lead wallet as one
    `MEMBERSHIP_CHARGE` ledger entry, and is checked for a current period
    before any charge. Renewal (job `prime.renew`) runs once at period end, or
    the period simply ends.
  - Lead billing applies the bonus leads after the standard 30 free leads.
  - The badge is display only and never affects ranking. Priority tickets go
    first in the support queue.
  - Individual plans answer `NOT_CONFIGURED` (they would need the payment
    provider).
- **Phase 11 — AI translation, triage, recommendations.**
  - AI translation is a second covenant-bound purpose on the AI port, and
    answers `NOT_CONFIGURED` while no model is connected.
  - `/which-dentist` (TL-TRIAGE-001) routes concerns with fixed rules, not AI
    and not a diagnosis. Red-flag questions come first, with the emergency
    number. It runs in the browser and nothing is sent or stored. **CLINICAL
    REVIEW REQUIRED:** the page says the rules await a clinical reviewer.
  - Related articles (TL-RECOMMENDATIONS-001) are rule-based: same treatment,
    then same specialty, then same kind.
- **Phase 12 — exchange rates, tax packs, enterprise** (TL-ENTERPRISE-001,
  TL-GLOBAL-EXPANSION-001).
  - Staff record exchange rates with a source and date. Rates are used only for
    report totals labelled as approximate, and only when every rate is known.
    Money is still never converted silently.
  - Tax packs exist for GST, VAT, sales tax and none. Country readiness now
    includes a tax-pack check (6 checks).
  - Enterprise groups are one level deep. Agreements record the term and the
    first-response and resolution hours; SLAs are stamped on each covered
    ticket and reported as met, breached or running.
  - Data residency is compared with the declared `TOOTHLOGY_HOSTING_REGION`.
    Single sign-on required is shown as not met while the SSO port is
    `NOT_CONFIGURED`.
- **Honest limits.**
  - "Compliance packs" means tax packs only.
  - No payment, AI or SSO provider is connected.
  - Contracts themselves are signed outside Toothlogy.

---

## Verification results

All-phase certification, 2026-09-11, on the final code, real exit codes (full
detail, including every failure's classification, in the ledger's "All-phase
certification" section):

```
Type-check   exit 0 (again after the registry change: exit 0)
Lint         exit 0
Unit         396 passed, 32 files; registry 18 passed at DELIVERED_THROUGH_PHASE = 12
Integration  full run 258 passed / 2 failed, 31 files. Enterprise: test reset bug,
             fixed → 3/3. phase4-completion: 100% CPU → 15/15 alone
E2E          49 tests in 21 specs. Full run 33 passed / 8 failed / 8 not run (1.7 h).
             Targeted reruns 16 + 4 + 2 passed. All 49 passed on the final code.
             Failures: cold dev compiles, one Postgres drop, two test bugs (fixed);
             0 product defects. The credential-gated Phase 4 journeys now run with a
             test-created administrator
Production   next build OK (362 routes); smoke PASS: nonce CSP with strict-dynamic,
             0 un-nonced scripts, API HSTS, 401 signed out on the new APIs, sitemap 18,
             warm TTFB 57–850 ms, no console errors
Security     npm audit 0; probes: traversal and injection-shaped ids 401,
             unknown API 404, login 429 on the 6th attempt
Database     27 migrations on development and test, no drift; integrity checks all 0
Registry     modules 56 implemented · 2 prepared · 1 planned
```

Verdict: **delivered through Phase 12**, with no P0 or P1 open. What remains is
outside the code: provider credentials for every `NOT_CONFIGURED` integration,
a clinical reviewer for the triage rules, and business decisions (Prime prices,
enterprise contracts).

**Follow-up, same day.** The remaining tasks that need no provider, credential
or business decision are done; the change log in the ledger has the detail.
- **P3 fixes:** unknown API paths return a JSON 404, a wrong sign-in returns
  401, pages carry HSTS, and an axe scan now covers every public page.
- **Accessibility:** the scan found three defects, now fixed; 14/14 pages pass.
- **UI gaps closed:** the claim page, organization profile and logo, branch
  photos, and dentist analytics.

Evidence:

```
Static       tsc 0, eslint 0
Tests        unit 57 + csp 5/5; integration 84 passed (5 files)
E2E          accessibility 14/14; listing-and-profile 3/3
Build        next build OK, 365 routes
Smoke        page HSTS 9/9, JSON 404, wrong sign-in 401, TTFB 62–438 ms
```

**Second follow-up, same day: pending tasks and bugs.**
- **Built:** treatment plans (migration 28), scheduled monthly statements, a
  review invitation on the visit-complete notice, review and message events,
  route-group 404 pages with headings, and a faster `/find` with a
  "Searching…" state.
- **Tooling:** visual regression tests and a load-test script.
- **Fixed:** two product bugs caught by our own tests — soft 404s, and a
  moderation confirmation that vanished.
- **Still open:** the development-only script-tag warning; its cause is not
  yet identified.

```
Static       tsc 0, eslint 0, registry 18/18
Tests        unit 398/398 (32 files); integration 264/264 (33 files)
E2E          79/79 on the final code (full run 74 + targeted reruns 10)
Build        next build OK, 369 routes
Smoke        page HSTS 9/9, JSON 404, 401, unknown clinic 404, TTFB 36–146 ms
Load         20 users × 30 s: 623 req, 0 errors, p95 1909 ms (dev machine)
Migrations   28 applied on development and test, no drift
```

Integration tests run against a real database rather than a mocked ORM, because
a mock cannot verify a unique constraint, a transaction rollback, or the atomic
single-use token consumption that stops two people redeeming one password-reset
link.

---

## Known limitations

| Limitation | Consequence | Owner |
|---|---|---|
| No email, SMS, push or payment provider | Nothing leaves the platform except in-app notices; invitations return a link to share by hand | Phase 1 providers |
| Geocoding is city-level without a maps provider | "Find on map" gives an approximate city-centre pin, and the form says so | Phase 1 providers |
| No malware scanner configured | Uploads are recorded as not scanned; set `FILE_SCAN_REQUIRED` to hold them instead | Phase 1 providers |
| Dev console shows "Encountered a script tag…" when an account page answers not-found to a non-member | Development-only warning (production React does not emit it). It persists after the 404 pages moved inside their route groups, and no hydration mismatch accompanies it; the cause is not yet identified. The 404 itself is correct: status 404, heading, account navigation (browser-tested) | Phase 2 |
| Locations created before 2026-09-10 have `req_`-prefixed ids | Cosmetic: ids are opaque; new rows use `loc_` and `bhr_` | — |
| Triage rules (`/which-dentist`) not yet clinically reviewed | The page says so; CLINICAL REVIEW REQUIRED | Clinical reviewer |
| The development server compiles each route on first use (30–80 s under load) | Cold-route timeouts in E2E; rerun on warm routes. Not seen on the production build | Test environment |
| No legal entity name, registered office, telephone number, company registration number or grievance officer has been provided | The Master Terms and the Privacy Policy state none. §85 says so in a neutral note rather than inventing one, and §38 names no officer. Indian consumer and IT rules generally expect a named grievance contact, so this needs filling before launch | Toothlogy (business) |
| Only three legal documents exist: the Master Terms, the Privacy Policy and the interns and volunteers terms | §82 and §84 list a Cookie Policy, a Refund and Cancellation Policy, a Disclaimer and Community Guidelines as **not published**, and say an unpublished document is not in force. Nothing links to a page that does not exist | Toothlogy (business) |
| The Terms have not been reviewed by a lawyer | They are drafted from the text Toothlogy supplied, with no invented registration, approval, jurisdiction, insurance or medical standard. Jurisdiction-specific review is still required, particularly before international use (§76) | Toothlogy (legal) |
