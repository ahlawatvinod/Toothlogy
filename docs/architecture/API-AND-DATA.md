# Toothlogy API, Data & Event Architecture

**Document ID:** `TL-DOC-APIDATA-001`
**Governed by:** founding spec §11, §12, §13

---

## Part 1 — API conventions

Defined once so every future module consumes them rather than inventing its own.

### Response envelope

```jsonc
// success
{ "ok": true,  "data": { … }, "meta": { "requestId": "req_…", "timestamp": "…" } }

// failure
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "…", "details": { … } },
  "meta": { "requestId": "req_…", "timestamp": "…" } }
```

The single `ok` discriminant is what makes a generic client possible: one place
to check for failure, one place to surface an error, one place to read a request
ID. Without it, every consumer re-implements "did this work?" against a slightly
different shape per endpoint.

`meta.requestId` is on **every** response, including errors — that is when a
user reports a problem and support needs the exact log line.

### Error codes

A closed set. Clients branch on these strings, so they are as much a contract as
the URL.

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Input failed schema validation; `details` names the fields |
| `UNAUTHENTICATED` | 401 | No principal, or session expired/revoked |
| `FORBIDDEN` | 403 | Authenticated, lacks the permission |
| `NOT_FOUND` | 404 | Does not exist, or the caller may not know it does |
| `CONFLICT` | 409 | Duplicate, or a lost update |
| `PRECONDITION_FAILED` | 412 | Well-formed but not allowed in current state |
| `RATE_LIMITED` | 429 | `details.retryAfterSeconds` |
| `FEATURE_DISABLED` | **404** | Switched off by a flag |
| `NOT_IMPLEMENTED` | 501 | Not built yet — distinct from "no such thing" |
| `UPSTREAM_FAILED` | 502 | A provider failed or timed out |
| `NOT_CONFIGURED` | 503 | No adapter registered (Constitution P10) |
| `INTERNAL` | 500 | Unexpected; **never exposes its message** |

`FEATURE_DISABLED` maps to 404, not 403, so flag state cannot be probed from
outside to enumerate unreleased capabilities.

### Versioning

`/api/v1/…`. **A breaking change creates v2; it never edits v1.** Adding an
optional field is not breaking; removing a field, renaming one, or narrowing a
type is.

### Pagination — cursors, not offsets

```
GET /api/v1/dentists?limit=20&cursor=dXNyXzAxSkYz&sort=-rating&filter[city]=raipur&q=implant
```

`?page=5&size=20` re-runs `OFFSET 80` on every request: the database still walks
the skipped rows, so deep pages get slower as data grows — and any insert during
paging shifts every later page, duplicating and skipping rows. Offset paging is
the single most common cause of "a result sometimes appears twice" in list UIs.

A cursor pointing at the last item seen is stable under concurrent writes and
stays fast at any depth. `hasMore` comes from fetching `limit + 1` rows, which
avoids a `COUNT(*)` on every list request just to render a "next" button.

Cursors are base64url-encoded to signal opacity, and **validated on decode** —
`Buffer.from(x, 'base64url')` silently discards invalid characters rather than
throwing, so an unvalidated decode turns garbage into a plausible-looking
cursor.

### Sorting and filtering

Both are **allow-listed per endpoint**. An unknown sort field is rejected — a
client-supplied column name reaching an ORM's `orderBy` is an injection risk and
a schema leak. An unknown *filter* is rejected too, because a silently dropped
filter returns **more** data than was asked for: the dangerous direction.

### Idempotency

Every mutating endpoint declares its stance; the registry integrity test rejects
one that does not.

The scenario: a patient taps "Confirm booking", the response is lost to a flaky
mobile connection, and the app retries. Without an idempotency key that is two
appointments and two charges.

A key reused with a **different body** is rejected with `CONFLICT` rather than
answered from cache — that is a client bug, and returning the cached response
would answer the wrong question.

### Rate limits

Named policies, referenced from the API registry: `public-generous`,
`authenticated-standard`, `auth-strict` (5/min, for brute-force targets),
`costly` (10/hour, for endpoints that spend money to serve).

---

## Part 2 — Data architecture

### Lifecycle conventions

Every table carries `id`, `createdAt`, `updatedAt`; `deletedAt` where soft
delete applies; and an explicit owner.

**Soft delete is not universal, deliberately.** Applying `deletedAt` everywhere
adds a `deletedAt IS NULL` clause to every query — one of which will eventually
be forgotten, silently exposing deleted data. Soft delete is used only where
something else references the row: deleting a user hard would orphan their audit
trail and clinical records.

Reference data and append-only logs use neither.

### Ownership

Exactly one division writes each table; everyone else reads through its service
interface (Constitution P7, §8). Direct foreign-table writes are a constitutional
violation, not a shortcut.

| Data | Owner |
|---|---|
| Identity, sessions, credentials | Division 01 |
| Clinical records | **The patient** — clinics hold revocable, audited grants |
| Payments, ledger | Division 23 — append-only; corrections are new entries |
| Audit log | Division 33 — **immutable; no division may delete** |

### Foundation schema

`User` · `Credential` · `Session` · `RoleAssignment` · `Organization` ·
`OrganizationMember` · `Profile` · `Consent` · `Country` · `Region` · `City` ·
`Address` · `AuditEvent` · `OutboxEvent` · `IdempotencyRecord` ·
`FeatureFlagOverride` · `FileObject` · `NotificationPreference`

**No domain models.** There is no `Appointment`, `DentalRecord`, `Product` or
`Lead`. Modelling them now would freeze decisions belonging to Phases 4–9, and a
half-designed clinical schema is harder to correct than an absent one.

### Decisions worth stating

- **One `User` for every constituent type.** A dentist who is also a patient is
  one account with two profiles. Separate user tables would make that person two
  accounts that cannot see each other's data.
- **One `Organization` shape** for clinic, hospital, college, supplier and
  employer — so organization-scoped permissions and membership are written once.
- **Roles live in code, not in a table.** Role definitions are security-critical
  architecture; they belong in version control, in code review, and in the
  registry integrity test — not in a table an administrator can edit at 2am.
  Only *assignments* are data.
- **Coordinates are `Decimal`, not `Float`** — float drift moves a clinic by
  metres per round trip.
- **`AuditEvent` has no `updatedAt` and no `deletedAt`.** The absence of those
  columns is the schema stating the immutability rule.

Status: ✅ schema authored and `prisma validate` passes. 🔴 No migration has been
run — Phase 1.

---

## Part 3 — Events

Events are the seam between divisions: a division announces a fact about its own
data, and others react without the publisher knowing they exist. That is what
keeps 35 divisions from becoming 35 × 34 direct dependencies.

### Rules

1. **Events are facts, past tense.** `APPOINTMENT_CONFIRMED`, never
   `CONFIRM_APPOINTMENT`. An event is not a command, and no subscriber may be
   assumed to exist.
2. **Payloads carry IDs, not sensitive bodies.** `MESSAGE_RECEIVED` carries
   thread and sender IDs — never message content.
3. **Unregistered names are rejected.** Publishing `APPOINTMENT_CONFIRMD` would
   otherwise succeed silently and reach no subscriber: the appointment confirms,
   no notification is sent, and nothing anywhere reports an error.
4. **A failing subscriber cannot break the publisher or its siblings.** A
   notification provider being down must not roll back a confirmed appointment.

### Transactional outbox

The event row is written **in the same transaction** as the state change it
describes; a relay publishes it afterwards.

If the transaction commits, the event is committed with it and will be
delivered. If it rolls back, the event vanishes with it. Publishing directly
from application code cannot offer that — the process can die between commit and
publish, which is how "your appointment is confirmed" emails get sent for
appointments that do not exist.

### Registered events

`USER_CREATED` · `DENTIST_VERIFIED` · `CLINIC_VERIFIED` ·
`APPOINTMENT_CREATED` · `APPOINTMENT_CONFIRMED` · `APPOINTMENT_CANCELLED` ·
`LEAD_CREATED` · `LEAD_ACCEPTED` · `PAYMENT_COMPLETED` · `REVIEW_CREATED` ·
`MESSAGE_RECEIVED` · `ORDER_CREATED` · `DEVICE_CONNECTED`

✅ The bus is implemented and tested. 🟡 The event definitions are contracts with
no publishers — the divisions that would publish them are not built.

### Notifications

Callers name a registered notification and a recipient; they do **not** choose
channels. If each division picked its own, the rules that must hold
platform-wide — marketing consent, per-user preference, per-country legality —
would be reimplemented inconsistently in thirty-five places, and the one that got
it wrong would be the compliance incident.

`transactional: true` ignores marketing opt-out (the user asked for the
underlying service); `transactional: false` must respect consent in every
channel and jurisdiction. Getting that boolean wrong is a compliance incident,
not a UX bug — which is why it is a required field rather than an inferred
default.
