# Toothlogy Testing Strategy

**Document ID:** `TL-DOC-TESTING-001`
**Governed by:** Constitution P8 · founding spec §18

---

## What these tests are for

Not coverage. The suite exists to make specific, expensive failures impossible
to ship unnoticed:

| Failure it prevents | Suite |
|---|---|
| Money that does not reconcile | `money.test.ts` |
| One clinic's admin managing another clinic | `rbac.test.ts` |
| An internal error message reaching a client | `http.test.ts` |
| A credential appearing in a log line | `logging.test.ts` |
| An appointment shown in the wrong timezone | `i18n.test.ts` |
| A clinic silently missing from radius results | `location.test.ts` |
| An event that reaches no subscriber, silently | `events.test.ts` |
| A typo'd flag key defaulting to *on* | `flags.test.ts` |
| A replayable or brute-forcible OTP | `auth.test.ts` |
| **A fabricated "payment succeeded"** | `providers.test.ts` |
| A committed credential | `secrets.test.ts` |
| A form error that is visible but not announced | `components.test.tsx` |
| Architecture documentation drifting into fiction | `registry-integrity.test.ts` |
| A dentist verifying their own credentials | `integration/verification.test.ts` |
| One clinic reading another clinic's data | `integration/organizations.test.ts` |
| An unverified dentist appearing in patient search | `integration/verification.test.ts` |

A test that does not correspond to a real failure mode is maintenance cost
without benefit.

---

## Levels

| Level | Scope | Environment |
|---|---|---|
| `unit` | One module, no I/O | node |
| `integration` | Several modules together | node |
| `api` | Route contracts and conventions | node |
| `database` | Migrations, constraints, transactions, races | node + **real PostgreSQL** |
| `security` | Authorization, redaction, secrets | node |
| `ui` / `accessibility` | Components and their ARIA contracts | happy-dom |
| `performance` | Web Vitals, query shapes | *(Phase 2)* |
| `e2e` | Full user journeys in a browser | *(Phase 2)* |

Each registered suite declares which of the 21 certification dimensions it
provides evidence for, so a green run means something specific rather than
"nothing broke".

---

## Conventions

**Test behaviour, not implementation.** Component queries use `getByRole` and
`getByLabelText`, never CSS classes. A test that finds a button by class passes
even when the button has no accessible name; one that finds it by role and name
fails — which is the entire point.

**Assert against reality, not against the formula.** `location.test.ts` checks
Delhi–Mumbai ≈ 1150 km rather than comparing haversine to itself. A test that
re-implements the code it tests proves only that the code is self-consistent.

**Isolate module state.** `tests/setup.ts` resets event subscribers, log and
audit sinks, and the config cache after every test. Without it, a subscriber
registered in one test fires during another and the failure appears in an
unrelated file — the hardest kind of flake to trace.

**Name the failure, not the function.** `'denies the same permission in a
different organization'` beats `'can() returns false'`: it survives a rename and
tells a future reader why the test exists.

---

## Current state

```
Test Files  16 passed (16)
     Tests  335 passed (335)
```

Counts below are produced by `node scripts/count-tests.cjs` from a real run,
not typed by hand:

| Suite | Tests | Level |
|---|---|---|
| `tests/registry/registry-integrity.test.ts` | 10 | unit |
| `tests/platform/money.test.ts` | 25 | unit |
| `tests/platform/rbac.test.ts` | 19 | security |
| `tests/platform/http.test.ts` | 36 | api |
| `tests/platform/logging.test.ts` | 12 | security |
| `tests/platform/i18n.test.ts` | 19 | unit |
| `tests/platform/location.test.ts` | 19 | unit |
| `tests/platform/events.test.ts` | 13 | unit |
| `tests/platform/flags.test.ts` | 11 | unit |
| `tests/platform/auth.test.ts` | 25 | security |
| `tests/platform/providers.test.ts` | 21 | integration |
| `tests/security/secrets.test.ts` | 14 | security |
| `tests/design-system/components.test.tsx` | 33 | accessibility |
| `tests/integration/auth.test.ts` | 29 | **database** |
| `tests/integration/organizations.test.ts` | 26 | **database** |
| `tests/integration/verification.test.ts` | 23 | **database** |

### Integration tests run against real PostgreSQL

The three `database`-level suites use an actual database, not a mocked ORM.
A mock verifies that we called the functions we think we called; it cannot
verify a unique constraint, a transaction rollback, an `ON CONFLICT` clause, or
the atomic single-use token consumption that stops two people redeeming one
password-reset link. Those are exactly where the dangerous bugs live.

They run in a separate Vitest project with `fileParallelism: false`, because
they share one database and truncate it between tests — run in parallel they
corrupt each other and produce failures that look like real bugs.

### Defects these tests found

Four, so far, all fixed:

1. **`decodeCursor` accepted malformed input.** `Buffer.from(x, 'base64url')`
   silently discards invalid characters rather than throwing, so garbage became
   a plausible-looking database cursor.
2. **Unconfigured providers threw synchronously** instead of returning a
   rejected promise, so `provider.send(...).catch(...)` would have escaped
   entirely — surfacing as an uncaught exception in a caller that had, by the
   types, handled the error correctly.
3. **`createOrganization` trusted its caller to validate**, so a reserved slug
   like `admin` reached the database when the service was called directly rather
   than through the API route.
4. **The secret scanner was nearly vacuous**, listing only files already in the
   git index — missing brand-new files, which are precisely the ones most likely
   to contain a pasted credential.

---

## Not yet built

🔴 Deferred, with the phase that owns each:

| Gap | Phase |
|---|---|
| End-to-end browser journeys | 2 |
| Visual regression | 2 |
| Automated axe accessibility audit per page | 2 |
| Load and performance testing | 4 |
| Payment provider sandbox tests | 4 |
| Coverage thresholds in CI | 1 |

Coverage thresholds are deliberately not set yet. On a foundation this size a
percentage target rewards testing trivial getters over the thirteen failure
modes listed at the top.

---

## Running

```bash
npm test                  # everything
npm run test:watch        # watch mode
npm run registry:validate # architecture integrity only
npm run verify            # typecheck + lint + test — the CI gate
```
