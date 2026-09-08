# THE TOOTHLOGY CONSTITUTION

**Status:** Ratified — Phase 0
**Document ID:** `TL-DOC-CONSTITUTION-001`
**Supersedes:** nothing (first ratification)
**Amendment procedure:** §12

> This is the governing product and engineering specification for Toothlogy.
> Where any other document, ticket, design or line of code conflicts with this
> Constitution, **this Constitution wins** — or the Constitution is amended under §12.
> It is never silently overridden.

---

## 1. Mission

Toothlogy is a **global dental ecosystem**.

> **Help every good dentist get discovered by the right patient at the right time, while
> giving patients a trusted end-to-end dental experience.**

Two obligations sit inside that one sentence, and neither may be sacrificed for the other:

1. **To the dentist** — competence should be discoverable. A good dentist without a
   marketing budget must still be findable by the patient who needs exactly them.
2. **To the patient** — the journey from *"my tooth hurts"* to *"I am treated and I have my
   records"* must be trustworthy at every step, not merely at the point of booking.

When a proposed feature serves one side by degrading the other, it is out of order.

### 1.1 Constituents

Toothlogy serves seventeen constituent types. Every one is a first-class citizen of the data
model, not an afterthought bolted onto a patient app:

`patients` · `dentists` · `clinics` · `hospitals` · `dental colleges` · `students` ·
`interns` · `employers` · `researchers` · `authors` · `manufacturers` · `distributors` ·
`wholesalers` · `retailers` · `suppliers` · `service providers` · `administrators`

**Constitutional consequence.** No module may assume "the user is a patient." Identity is
modelled as one `User` who holds one or more typed `Profile`s and belongs to zero or more
`Organization`s. See `docs/architecture/DATA-ARCHITECTURE.md`.

---

## 2. The Five Pillars

Every major feature must map to **one or more** pillars. A feature that maps to none does not
belong in Toothlogy — that is the test, and it is meant to have teeth.

| # | Pillar | The promise | Answers the question |
|---|---|---|---|
| 1 | **LEARN** | Dental knowledge that is accurate, sourced and understandable at the reader's level | *"What is actually wrong with me / what should I know?"* |
| 2 | **DISCOVER** | The right dentist, clinic, college, product or opportunity — surfaced on merit | *"Who is right for this, near me, now?"* |
| 3 | **TRUST** | Verified identity, verified credentials, honest reviews, transparent pricing | *"Why should I believe this?"* |
| 4 | **CONNECT** | Reliable communication between every constituent pair | *"How do I reach them, and did it get through?"* |
| 5 | **BOOK** | Commitment with certainty — appointments, orders, payments that actually hold | *"Is it confirmed, and what happens next?"* |

### 2.1 Pillar mapping is mandatory and machine-checked

Every module in the registry declares its pillars. This is enforced by type, not convention:

```ts
// src/registry/modules.ts
pillars: ['DISCOVER', 'BOOK']   // required, non-empty
```

A module with an empty pillar array fails the registry integrity test
(`tests/registry/registry-integrity.test.ts`).

### 2.2 The pillars are ordered by dependency, not importance

TRUST is load-bearing for DISCOVER and BOOK: an unverified dentist should not rank, and an
unverified clinic should not take payment. LEARN is the top of the funnel and must work for
anonymous users with no account. This ordering is why the phase plan builds identity and
verification (Phases 1–3) before discovery and booking (Phase 4).

---

## 3. Founding principles

These are the rules that decide arguments. They are written to be *applied*, not admired.

### P1 — Clinical safety outranks growth

Anything touching diagnosis, prescription, medical records or treatment advice is held to a
clinical-safety standard, not a product-metrics standard. Health content is sourced and
attributed. Toothlogy does not diagnose. AI never issues clinical advice unattributed or
unreviewed — see §5.

### P2 — Trust is earned in public and revocable

Verification has a subject, an evidence trail, a verifier, a timestamp and an expiry. A
verified badge that cannot be revoked is not a verification. See
`docs/architecture/DATA-ARCHITECTURE.md`.

### P3 — Merit ranks above spend

Paid placement is permitted and is a legitimate revenue line. Paid placement that is
**indistinguishable from organic ranking is forbidden.** Every promoted result is labelled
as such, in every surface, including API responses.

### P4 — Patients own their health data

Records belong to the patient. Clinics and dentists hold access grants, not ownership.
Access is explicit, time-boundable, revocable and audited. Export is a right, not a feature.

### P5 — Globalization is structural, not a translation pass

Country, language, currency, timezone and regulation are **inputs to every layer**, never
constants. India is the first market, never an architectural assumption. See §4.

### P6 — Every important object has a stable public ID

IDs are assigned once and never reused, even after deletion. See
`docs/architecture/ID-SCHEME.md`.

### P7 — The foundation is shared; divisions are not free to reinvent it

Auth, RBAC, errors, pagination, i18n, money, events, logging and the design system are
platform-owned. A division that writes its own is a defect, not a preference.

### P8 — Nothing ships as "done" without certification

Building, loading and responding are not evidence of readiness. See §7 and
`docs/testing/CERTIFICATION-STANDARD.md`.

### P9 — Honest state reporting

Documentation and status reports distinguish ✅ IMPLEMENTED / 🟡 PREPARED / 🔴 NOT
IMPLEMENTED. Claiming unimplemented functionality is the most serious process violation in
this repository, because every later decision compounds on it.

### P10 — No fake success

Payments, verifications, notifications and integrations never simulate success. An unwired
provider returns a typed "not configured" error. It does not return `{ ok: true }`.

---

## 4. Globalization covenant

Toothlogy must reach a new country **without an architectural rewrite**. Therefore:

- No hard-coded country, currency, locale, timezone, tax rate, phone format or address shape.
- Money is `{ amountMinor: bigint, currency: CurrencyCode }` — **never a float**, never a bare
  number. See `src/platform/money`.
- All timestamps are stored UTC and rendered in the viewer's timezone.
- Every user-visible string is translatable; the UI must survive RTL and ~2x text expansion.
- Tax is a pluggable per-country strategy (GST, VAT, sales tax, none).
- Compliance is per-country configuration, not per-country code branches.

Detail: `docs/architecture/GLOBALIZATION.md`.

---

## 5. AI covenant

AI is a Toothlogy capability (Division 27, Phase 11) governed from day one:

1. **AI never diagnoses.** It may summarise, translate, triage-route, rank, draft and
   explain. Clinical conclusions come from licensed humans.
2. **AI output is labelled** wherever a user can see it.
3. **AI touching patient data respects the same permission checks as any other actor** — no
   privileged backdoor path to records.
4. **AI ranking is auditable.** If a model influences discovery order, that influence is
   recorded and inspectable.
5. **Training on patient data requires explicit, revocable, purpose-scoped consent.**

Status: NOT IMPLEMENTED. Covenant ratified now so Phase 11 cannot quietly violate it.

---

## 6. Architecture hierarchy

Toothlogy is organised in exactly this hierarchy, top to bottom:

```
TOOTHLOGY
└── DIVISION          capability domain, numbered 01-35, owns its data
    └── MODULE        coherent unit of functionality inside a division
        └── PLUGIN    optional, independently loadable extension
            └── TOOL          reusable cross-cutting capability
                └── PAGE      addressable user surface
                    └── COMPONENT    UI building block
                        └── API      versioned contract
                            └── DATABASE     persistence
                                └── INTEGRATION   external system
                                    └── PERMISSION    access control
                                        └── TEST      proof it works
```

This hierarchy is **reflected in the registries** (`src/registry/`) and documented in
`docs/architecture/HIERARCHY.md`. It is not decoration: registry integrity tests assert that
every module names a real division, every page names a real module, every API names real
permissions, and so on down the chain.

---

## 7. Certification standard

A module or page is **not production-ready** merely because it builds, loads, responds, or
performs basic CRUD.

Certification requires evidence across all 21 dimensions:

`FUNCTIONAL` · `UI/UX` · `DESKTOP` · `MOBILE` · `RESPONSIVE` · `ACCESSIBILITY` · `API` ·
`DATABASE` · `AUTH` · `PERMISSIONS` · `SECURITY` · `PAYMENT` · `NOTIFICATIONS` ·
`PERFORMANCE` · `SEO` · `INTEGRATIONS` · `EMPTY STATES` · `LOADING STATES` · `ERROR STATES` ·
`EDGE CASES` · `REGRESSION`

For important user-facing modules, certification additionally requires competitive
benchmarking against 2–5 best-in-class products, documented as
**WHAT · WHY · BENCHMARK · TOOTHLOGY ADVANTAGE/GAP · RECOMMENDATION**.

Binding from **Prompt 3** onward. Full procedure:
`docs/testing/CERTIFICATION-STANDARD.md`.

---

## 8. Data ownership

| Data | Owner | Notes |
|---|---|---|
| Identity, credentials, sessions | Division 01 | No other division writes these |
| Patient clinical records | **The patient** | Clinics hold revocable, audited access grants (P4) |
| Clinic operational data | The clinic organization | |
| Reviews | The author | Subject may respond, never edit or delete |
| Payments and ledger | Division 23 | Append-only; corrections are new entries, never mutations |
| Audit log | Division 33 | **Append-only. Immutable. No division may delete from it.** |

Cross-division writes go through the owning division's service interface. Direct foreign
table writes are a constitutional violation (P7).

---

## 9. Security baseline

Non-negotiable from commit one:

- No secret, credential, key or token in source control — ever, including tests and fixtures.
- Every API route resolves an authenticated principal and an explicit permission decision.
  **Default deny.**
- All input validated at the boundary with a typed schema.
- Every mutation writes an audit event with actor, action, subject, timestamp, request ID.
- Passwords hashed with a memory-hard algorithm. Never logged, never returned, never
  reversible.
- Sensitive files (records, X-rays, prescriptions) are never publicly addressable; access is
  authorized per-request and time-limited.
- Logs never contain secrets, tokens, passwords or unnecessary PHI/PII.

Detail: `docs/security/SECURITY.md`.

---

## 10. Delivery discipline

- Unfinished work ships **behind a feature flag**, defaulting to `disabled` in production.
- Flag lifecycle: `disabled → development → beta → enabled → deprecated`.
- The repository is never knowingly left broken. Build, lint, type-check and tests pass
  before any prompt is declared complete (P9).
- Breaking an API contract requires a new API version, not an edit to the current one.

---

## 11. Phase discipline

Toothlogy is built in 13 numbered phases (0–12), documented with dependencies in
`docs/architecture/PHASES.md`.

- A phase may depend only on **completed, certified** earlier phases.
- Foundation work belongs in Phase 0–1, not smuggled into a business phase.
- **Prompt 1 delivers Phase 0 only.** Business functionality is explicitly out of scope; the
  Constitution treats premature domain implementation as a violation equal to skipping
  architecture.

---

## 12. Amendment procedure

This Constitution changes only by explicit amendment:

1. State the clause being amended and the concrete problem it caused.
2. State the replacement text.
3. State the migration consequence for already-built modules.
4. Record it in `docs/constitution/AMENDMENTS.md` with a date and rationale.
5. Bump the ratification note at the top of this file.

Silent drift — code that contradicts a clause nobody amended — is a defect. When code and
Constitution disagree, one of them is wrong and the disagreement is resolved, not tolerated.
