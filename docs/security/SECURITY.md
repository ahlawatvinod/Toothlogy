# Toothlogy Security Architecture

**Document ID:** `TL-DOC-SECURITY-001`
**Governed by:** Constitution §9
**Division:** 33 — Security & Compliance

> Toothlogy holds dental records, prescriptions, X-rays and payment data. The
> consequences of getting this wrong are clinical and financial, not
> reputational. Security is therefore part of the foundation rather than a
> hardening pass before launch.

---

## 1. Non-negotiables

Ratified in Constitution §9 and enforced mechanically where possible:

| Rule | Enforced by |
|---|---|
| No secret in source control | `tests/security/secrets.test.ts` |
| Default deny on every route | `defineRoute` + `can()` |
| All input validated at the boundary | zod schema per route |
| Every mutation audited | `defineRoute` (automatic for mutations) |
| Memory-hard password hashing | `src/platform/auth/password.ts` |
| Sensitive files never publicly addressable | `src/platform/storage/ports.ts` |
| Logs never contain secrets or PHI | `src/platform/observability/logger.ts` |

Each has a test. A rule with no test is an intention, not a control.

---

## 2. Authentication

**Passwords — scrypt** (`N=16384, r=8, p=1`), from Node's standard library.

Argon2id is the better algorithm in the abstract. Every Node binding for it is a
native addon, which means a compiler toolchain in CI, in Docker and on every
developer machine including Windows. scrypt is memory-hard, is OWASP-recommended
for password storage, needs no build step, and is therefore the one that will
actually be deployed everywhere. A well-parameterised scrypt in production beats
an Argon2id that breaks the install.

- Parameters travel inside the encoded hash, so cost can be raised later without
  invalidating existing passwords (`needsRehash()` upgrades on next login).
- Verification is timing-safe. A byte-wise `===` returns faster on an early
  mismatch, and that difference is measurable remotely.
- Passwords are NFKC-normalised before hashing, so the same password typed on
  macOS and Windows produces the same bytes.
- Policy favours length over composition rules: `Password1!` satisfies every
  classic rule and is weaker than a long passphrase.

**OTP** (`src/platform/auth/otp.ts`)

- Codes are stored as an HMAC, never in plaintext — a database read must not
  yield a working code, and support staff must not be able to read one.
- The HMAC binds the code to its destination, so a code issued to one recipient
  cannot be replayed against another.
- Attempts are capped at 5. A six-digit code has a million possibilities;
  unlimited guessing breaks it in minutes.
- Codes expire (10 minutes) and are single-use; a resend cooldown limits
  SMS-cost abuse.

**Sessions** — the database stores a *hash* of the session token, never the
token, for the same reason as passwords. Sessions are individually and bulk
revocable, and record IP and user agent so a user can recognise a device they do
not own.

Status: password and OTP logic ✅ IMPLEMENTED. Session persistence and principal
resolution 🟡 PREPARED — Phase 1.

---

## 3. Authorization

`principal → roles → permissions`, evaluated against a scope. Deliberately
small, because authorization logic that is clever is authorization logic nobody
can audit.

```
can(principal, 'tl.core.organization.manage', { organizationId: 'org_x' })
```

Three properties:

1. **Default deny.** No "allow unless denied" path exists. An unregistered
   permission key denies — a typo must fail closed.
2. **Roles grant; nothing denies.** No negative permissions, so the effective
   set is a plain union and cannot depend on evaluation order.
3. **Scope is checked, not assumed.** An `organization`-scoped permission applies
   only to organizations the principal belongs to. This is the check that stops
   one clinic's administrator from managing another clinic — the most likely
   serious authorization bug in a multi-tenant product, and the one
   `tests/platform/rbac.test.ts` targets most directly.

`ANONYMOUS` is a real object rather than `null`, so every route runs the same
check and simply denies, instead of growing `if (user)` branches whose else-path
skips authorization.

---

## 4. Transport and browser protections

Applied to every response by `securityHeaders()`:

| Header | Closes |
|---|---|
| `Strict-Transport-Security` | downgrade to plaintext HTTP (production only) |
| `X-Content-Type-Options: nosniff` | an uploaded "PNG" being sniffed as HTML — stored XSS via X-ray upload |
| `X-Frame-Options: DENY`, `frame-ancestors 'none'` | clickjacking a booking or payment confirmation |
| `Referrer-Policy` | a URL carrying a record ID leaking via `Referer` |
| `Permissions-Policy` | camera, microphone, geolocation and payment denied by default |

CSP allows `'unsafe-inline'` for **styles only** — Next.js injects inline style
attributes during hydration. Inline *scripts* stay blocked, which is the half
that matters for XSS. Script nonces replace this once user-generated content
exists.

---

## 5. Rate limiting

Named policies (`auth-strict`, `costly`, …) referenced from the API registry, so
a reviewer can see that a login endpoint is on the strict policy without judging
whether "5" is the right number.

Authenticated requests are keyed by **user ID**, not IP: IP keying punishes
everyone behind one NAT — a whole clinic, hospital or campus — for one user's
behaviour.

> **Known limitation, stated deliberately.** The Phase 0 limiter is in-memory
> and therefore per-process. With N instances the effective limit is N times the
> intended one. Phase 1 replaces the store behind the same interface. An
> in-memory limiter quietly assumed to be distributed is worse than none,
> because it is trusted.

---

## 6. Input and output

- **Input** — every request body is parsed by a zod schema at the boundary.
  Validation errors return field paths, which is safe: they describe the
  caller's own input, not our internals.
- **Query parameters** — sort fields and filter keys are allow-listed. An
  unknown filter is *rejected*, not ignored, because a silently dropped filter
  returns more data than was asked for.
- **Output** — React escapes by default. `dangerouslySetInnerHTML` appears
  exactly once, for the pre-paint theme script, with a static constant.
- **SQL** — Prisma parameterises; no raw string interpolation.
- **Uploads** — clinical uploads are allow-listed by content type. SVG is
  excluded despite being an image: it can carry script.

---

## 7. Secrets

- Configuration is read in exactly one place (`src/platform/config`), validated
  by schema, and secrets are marked in the registry.
- The logger's redaction list is *derived* from that registry marking, so
  marking a new secret automatically protects it in logs.
- Public config must carry the `NEXT_PUBLIC_` prefix — enforced by test —
  which is what stops an API secret from being bundled into client JavaScript by
  a careless rename.
- A secret may never have a default value: a default secret is a shared secret.
- `.env.example` carries names and shapes only. `.env*` is gitignored except the
  template.

---

## 8. Audit

Append-only, immutable, and distinct from application logs (Constitution §8).

Logs are for engineers, best-effort, and rotate away. Audit events are a durable
record with compliance weight: actor, action, subject, outcome, request ID,
timestamp. The `AuditEvent` table has **no `updatedAt` and no `deletedAt`** —
the absence of those columns is the schema stating the rule.

`userId` on an audit row is a plain string with no foreign key, so a cascade
delete can never remove history and the record survives deletion of the account
it describes.

Denied authorization attempts are recorded distinctly, because a cluster of
denials from one actor is what privilege probing looks like from the inside.

---

## 9. Sensitive file access

1. Sensitive objects are **never publicly addressable** — no guessable URL, no
   "unlisted" path. The common breach in health products is a private file
   behind a long URL assumed to be secret.
2. Access is authorized **per request**, then bounded by a short-lived signed
   URL.
3. Lifetime scales with sensitivity: PHI gets **60 seconds** — long enough to
   start a download, short enough that a URL in a browser history, a chat
   message or a screenshot is already dead.

---

## 10. Threat model — what is and is not covered

**Addressed in Phase 0:** credential stuffing (rate limits, hashing), session
theft (hashed tokens, revocation), privilege escalation (default deny, scope
checks), enumeration (ULIDs), XSS (CSP, escaping, upload allow-list),
clickjacking, secret leakage (redaction, scanning), double-charging
(idempotency), duplicate/lost events (outbox).

**🔴 NOT yet addressed — deferred with a stated owner:**

| Gap | Phase |
|---|---|
| Distributed rate limiting | 1 |
| MFA enrolment and recovery flows | 1 |
| Breach-corpus password check (k-anonymity API) | 1 |
| CSRF tokens for cookie-authenticated mutations | 1 |
| Encryption at rest for PHI columns | 6 |
| Payment webhook replay-window enforcement | 4 |
| Fraud and abuse scoring | 10 |
| Backup, restore and recovery drills | 1 |
| Penetration test and third-party review | before public launch |

Listing gaps is itself a control. An unwritten gap is indistinguishable from an
oversight, and Constitution P9 requires the distinction to be visible.
