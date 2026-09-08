<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Toothlogy — working rules

Read [`docs/constitution/CONSTITUTION.md`](./docs/constitution/CONSTITUTION.md)
first. It is the governing specification and it wins over any other document or
any line of code. Where they conflict, either the code is wrong or the
Constitution needs amending under §12 — the disagreement is resolved, never
tolerated.

## Report status honestly

Use ✅ IMPLEMENTED / 🟡 PREPARED / 🔴 NOT IMPLEMENTED, and mean them.
Overstating progress is the most serious violation in this repository, because
every later decision compounds on it. If something is a contract with no
behaviour behind it, say so.

## Never fake success

Payments, notifications, verifications and integrations return a typed
`NOT_CONFIGURED` error when no adapter is registered. Do **not** add a stub that
returns `{ ok: true }`, and do not add a "mock mode" that a caller could mistake
for the real thing. `tests/platform/providers.test.ts` enforces this.

## Use the platform; do not reinvent it

Auth, RBAC, errors, pagination, logging, money, i18n, events and the design
system are platform-owned (Constitution P7). A division writing its own is a
defect. If the platform is missing something you need, add it to the platform
for everyone.

Specifically:

- Money is `{ amountMinor: bigint, currency }` — never a float, never a bare
  number.
- Timestamps are stored UTC and rendered with an explicit timezone.
- API routes use `defineRoute`, which applies auth, permissions, rate limiting,
  validation, audit and the response envelope.
- `permissions: []` on a route means "deliberately public" — it is a decision,
  not an omission.

## Register before you build

Adding a module, page, API, entity, event, permission, flag or tool means adding
it to `src/registry/` **with an honest status**. IDs are assigned once and never
reused, even after deletion (Constitution P6).

Run `npm run registry:validate` — dangling references, duplicate IDs,
dependency cycles and unmapped pillars all fail there.

## Every feature maps to a pillar

LEARN · DISCOVER · TRUST · CONNECT · BOOK. A module with an empty `pillars`
array fails the integrity test. That is deliberate: a feature mapping to no
pillar does not belong in Toothlogy.

## Never commit a secret

Not in source, not in a test, not in a fixture, not "just for local".
`.env.example` carries names and shapes only. `tests/security/secrets.test.ts`
scans on every run.

## Do not overbuild the current phase

Phases are ordered by dependency (`docs/architecture/PHASES.md`). Building Phase
6 functionality during Phase 1 is a violation, not initiative — it freezes
decisions that later phases need to make with more information.

## Before declaring anything done

```bash
npm run verify      # typecheck + lint + test
npm run build
```

Fix regressions you caused. Never knowingly leave the repository broken
(Constitution §10).

## Certification

From Prompt 3, a module is production-ready only with evidence across all 21
dimensions in [`docs/testing/CERTIFICATION-STANDARD.md`](./docs/testing/CERTIFICATION-STANDARD.md).
Building, loading and responding are entry conditions, not completion.
