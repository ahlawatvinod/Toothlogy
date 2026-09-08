# Toothlogy Module Certification Standard

**Document ID:** `TL-DOC-CERTIFICATION-001`
**Governed by:** Constitution §7
**Binding from:** Prompt 3

---

## The rule

> A module or page is **not production-ready** merely because:
> it builds · the page loads · the API responds · basic CRUD works.

Those four are entry conditions for *starting* certification, not evidence of
finishing it. Every one of them can be true of a screen that is unusable on a
phone, unreachable by keyboard, silent when empty, and wrong when the network
fails.

---

## The 21 dimensions

Certification requires recorded evidence for **all 21**. Not "considered" —
evidence: a test, a recording, a measurement, or a written finding.

| # | Dimension | What counts as evidence |
|---|---|---|
| 1 | `FUNCTIONAL` | The stated user goal is achievable end to end |
| 2 | `UI/UX` | Information architecture and density reviewed against benchmarks |
| 3 | `DESKTOP` | Verified at 1280px and 1920px |
| 4 | `MOBILE` | Verified at 360px and 390px on a real touch device |
| 5 | `RESPONSIVE` | No horizontal body scroll at any width; no clipped content |
| 6 | `ACCESSIBILITY` | Keyboard-complete; correct roles and names; AA contrast; declared ARIA pattern honoured |
| 7 | `API` | Envelope, pagination, filtering, sorting, errors match conventions |
| 8 | `DATABASE` | Migrations reversible; indexes present for real query shapes |
| 9 | `AUTH` | Anonymous, authenticated and expired-session paths all verified |
| 10 | `PERMISSIONS` | Every role tested, including the ones that must be denied |
| 11 | `SECURITY` | Input validation, output encoding, rate limits, audit coverage |
| 12 | `PAYMENT` | Success, failure, retry, refund, webhook replay — never simulated |
| 13 | `NOTIFICATIONS` | Every channel; opt-out honoured; transactional override correct |
| 14 | `PERFORMANCE` | Core Web Vitals within budget; no N+1 queries |
| 15 | `SEO` | Metadata, canonical URL, structured data, correct indexability |
| 16 | `INTEGRATIONS` | Provider failure and timeout paths verified |
| 17 | `EMPTY STATES` | Every list and detail view has a designed empty state with a next step |
| 18 | `LOADING STATES` | Skeleton or spinner; no layout shift on load |
| 19 | `ERROR STATES` | Every failure has a message, a recovery path, and a request ID |
| 20 | `EDGE CASES` | Boundaries, long text, RTL, slow network, offline, concurrency |
| 21 | `REGRESSION` | Prior certified behaviour still passes |

### Why 17–19 are dimensions and not polish

Empty, loading and error states are where products are actually judged, and they
are the first things dropped under deadline pressure — precisely because they
are invisible on the happy path a demo follows. Making them named, required
dimensions is what stops "we'll add the empty state later" from becoming
permanent. The design system ships `EmptyState`, `LoadingState` and `ErrorState`
as primitives for the same reason: the easy path and the correct path are the
same path.

---

## Competitive benchmarking

For **important user-facing modules**, certification also requires benchmarking
against **2–5 best-in-class products**.

Evaluate, page by page: UX, workflow, information architecture, information
density, mobile UX, accessibility, operational UX, empty/loading/error states,
performance, and design-system consistency.

Document each finding in this exact form:

```
WHAT        The specific element or flow examined.
WHY         Why it matters to a Toothlogy user or operator.
BENCHMARK   What the comparison products do, concretely.
ADVANTAGE   Where Toothlogy is better, and why.
/GAP        Where Toothlogy is worse, stated plainly.
RECOMMEND   The specific change proposed, or an explicit decision not to change.
```

Two rules that keep this honest:

- **Name the gap even when it will not be fixed.** "Worse, accepted for now,
  because X" is a legitimate outcome. Omitting the gap is not.
- **Benchmark the workflow, not the screenshot.** Copying a competitor's layout
  without their constraints usually imports their compromises too.

Suggested comparison sets (to be revisited per module): appointment booking —
Practo, Zocdoc, Calendly, NHS App; marketplace — Amazon Business, Henry Schein,
IndiaMART; knowledge — Mayo Clinic, Colgate Oral Care Center, NHS Health A–Z.

---

## Procedure

1. **Declare** — add or update the `Certification` entry in
   `src/registry/tests.ts` with `status: 'in_progress'`.
2. **Evidence** — for each of the 21 dimensions, record a test, a measurement or
   a written finding. Automated evidence is preferred because it re-runs.
3. **Benchmark** — for user-facing modules, complete the table above.
4. **Fix or accept** — every gap is either fixed or explicitly accepted with a
   reason and an owner.
5. **Certify** — set `status: 'certified'`, list all 21 in `dimensionsPassed`,
   and set `certifiedAt`.
6. **Enable** — move the module's feature flag to `beta`, then `enabled`.

The registry integrity test rejects a `certified` record with fewer than 21
dimensions or without a date, so the paperwork cannot be skipped by editing one
field.

---

## Revocation

Certification is **revocable**, exactly like verification (Constitution P2).

A production incident, a regression, or a failed re-audit sets
`status: 'revoked'` and returns the module to a flag-gated state. A certification
that can never be withdrawn is a claim, not a control.

---

## Current state

| Certification | Subject | Status |
|---|---|---|
| `TL-FE-HOME-001` | `TL-PAGE-HOME-001` | 🔴 uncertified |
| `TL-FE-DESIGNSYSTEM-001` | `TL-PAGE-DESIGNSYSTEM-001` | 🔴 uncertified |

**Nothing is certified.** Phase 0 delivers the standard and the machinery to
enforce it; certification begins at Prompt 3. Recording anything else would be
the exact false-completeness Constitution P9 forbids.
