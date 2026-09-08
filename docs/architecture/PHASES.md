# Toothlogy Implementation Phases

**Document ID:** `TL-DOC-PHASES-001`
**Governed by:** Constitution §11

Thirteen phases, 0–12. A phase may depend only on **completed and certified**
earlier phases (Constitution §11).

---

## Dependency graph

```
        ┌─────────────────────────────────────────┐
        │  0  Constitution & Architecture         │  ← Prompt 1 (this)
        └────────────────────┬────────────────────┘
                             │
        ┌────────────────────▼────────────────────┐
        │  1  Global Platform Core                │
        └──────┬──────────────────────────┬───────┘
               │                          │
     ┌─────────▼─────────┐      ┌─────────▼─────────┐
     │ 2  Experience     │      │ 3  Dentist+Clinic │
     └─────────┬─────────┘      └─────────┬─────────┘
               └────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ 4  Discovery + Appointments│
              └─────────────┬─────────────┘
                            │
              ┌─────────────▼─────────────┐
              │ 5  Trust + Communication  │
              └──┬────────┬────────┬──────┘
                 │        │        │
       ┌─────────▼──┐ ┌───▼─────┐ ┌▼──────────┐
       │ 6 Patient  │ │ 7 Know- │ │ 8 Students│
       │   Journey  │ │   ledge │ │  +Careers │
       └─────┬──────┘ └───┬─────┘ └────┬──────┘
             └────────────┼────────────┘
                          │
              ┌───────────▼───────────┐
              │  9  Marketplace       │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │ 10  Prime + Growth    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │ 11  AI + IoT          │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │ 12  Global + Enterprise│
              └───────────────────────┘
```

---

## Phase detail

### Phase 0 — Constitution & Architecture ✅ *this prompt*

**Depends on:** nothing.
**Delivers:** Constitution, registries, platform foundation, design system,
security model, testing framework, plugin kernel, data conventions.
**Divisions touched:** 01, 02, 29, 33, 34, 35 (foundation only).
**Exit criteria:** build, lint, type-check and tests pass; registry integrity
green; no domain functionality claimed.

### Phase 1 — Global Platform Core

**Depends on:** 0.
**Delivers:** database migrations; working authentication (registration, login,
OTP, sessions); user and organization management; role assignment; location
reference data loaded; audit log persisted; outbox relay; the first real
integration adapters (email, SMS, storage).
**Divisions:** 01, 03, 29, 33, 34, 35.

> The largest single step. Everything after it assumes a real, authenticated
> user exists — which is why it is one phase rather than spread across several.

### Phase 2 — Toothlogy Experience

**Depends on:** 1.
**Delivers:** application shell and navigation; locale-prefixed routing; PWA;
account settings; the admin console; SEO foundations (sitemap, robots,
structured data).
**Divisions:** 02, 32.

### Phase 3 — Dentist + Clinic Ecosystem

**Depends on:** 1, 2.
**Delivers:** dentist profiles, qualifications, licence verification; clinic and
hospital organizations, branches, business hours, service catalogues;
verification workflow and queues.
**Divisions:** 04, 05.

> **Verification lands here, before discovery.** An unverified dentist must not
> rank (Constitution P2, P3), so the trust machinery has to exist before the
> ranking that depends on it.

### Phase 4 — Discovery + Appointment Engine

**Depends on:** 3.
**Delivers:** search and ranking; filters and facets; distance and radius
search; maps; availability, slots, booking, rescheduling, cancellation,
reminders; payment gateway adapter.
**Divisions:** 09, 10, 23, 29.

> The first phase where Toothlogy's core promise — the right dentist, booked
> with certainty — actually works end to end.

### Phase 5 — Trust + Communication

**Depends on:** 4.
**Delivers:** reviews and ratings tied to completed appointments; responses;
moderation; messaging threads; notification templates; support tickets.
**Divisions:** 25, 26, 30.

> Reviews depend on appointments: a review that cannot be tied to a real visit
> is the thing every review system eventually regrets not requiring.

### Phase 6 — Patient Health Journey

**Depends on:** 5.
**Delivers:** patient-owned dental records; treatment history; clinical
documents and imaging; revocable, audited access grants; prescriptions; PDF and
QR tools.
**Divisions:** 11, 12.

> The highest-sensitivity phase. It follows the full security foundation
> deliberately — records must not be built before audit, consent and file
> authorization are proven in production.

### Phase 7 — Knowledge + Research + Community

**Depends on:** 2 *(content is public and does not require the clinical core)*.
**Delivers:** knowledge base of conditions, treatments and procedures with
citations; research papers and authorship; blogs, posts, media and moderation.
**Divisions:** 13, 14, 15.

> Parallelisable with 5 and 6 — it depends on the experience layer, not on
> clinical data.

### Phase 8 — Students + Colleges + Careers

**Depends on:** 3, 7.
**Delivers:** colleges, accreditation, courses; student profiles and enrolment;
internships, job postings, applications and resumes.
**Divisions:** 06, 07, 08.

### Phase 9 — Marketplace

**Depends on:** 4 *(payments)*, 3 *(supplier organizations)*.
**Delivers:** product catalogue and variants; equipment, warranty and AMC;
supplier onboarding; cart, checkout, orders, fulfilment, returns; wallet, ledger,
invoices and tax.
**Divisions:** 16, 17, 18, 19, 24.

### Phase 10 — Prime + Advertising + Growth Engine

**Depends on:** 9.
**Delivers:** leads (including ₹90 lead pricing, acceptance, quality scoring and
refunds); Prime membership and entitlements; campaigns, placements and
attribution; analytics dashboards.
**Divisions:** 20, 21, 22, 31.

> Every promoted placement must be labelled in every surface, including API
> responses (Constitution P3). The `promoted` flag already exists in the search
> contract so this cannot be added as an afterthought.

### Phase 11 — AI + IoT + Advanced Intelligence

**Depends on:** 6, 10.
**Delivers:** AI summarisation, translation, triage routing and recommendations
under the AI covenant; connected device registration, telemetry and alerting.
**Divisions:** 27, 28.

> Bound by Constitution §5, ratified in Phase 0 precisely so this phase cannot
> quietly violate it.

### Phase 12 — Global Expansion + Enterprise

**Depends on:** all.
**Delivers:** additional country enablement; multi-currency pricing and exchange
rates; localized tax and compliance packs; enterprise contracts, SSO, SLAs and
data residency.
**Divisions:** all.

> If the Phase 0 globalization covenant held, this phase is largely
> configuration and translation rather than re-architecture. **That is the test
> of whether Phase 0 succeeded.**

---

## Cross-phase rules

1. **No phase begins until its dependencies are certified** (Constitution §7).
2. **Foundation work belongs to Phases 0–1.** A business phase that needs a new
   platform capability adds it to the platform, for everyone — it does not build
   a private copy (Constitution P7).
3. **Every phase ships behind flags**, defaulting to `disabled` in production
   until certified.
4. **Every phase re-runs the §1 audit** against the then-current repository.
   From Prompt 2 onward that is a genuine brownfield audit with real reuse and
   compatibility obligations.
