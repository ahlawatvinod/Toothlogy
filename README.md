# Toothlogy

**A global dental ecosystem.**

> Help every good dentist get discovered by the right patient at the right time,
> while giving patients a trusted end-to-end dental experience.

---

## Current state — Phase 0 of 12

This repository contains the **foundation only**: the Constitution, the
architecture registries, the platform core, the design system, the security
model and the testing framework.

**No business functionality has been built.** No appointments, no discovery, no
records, no marketplace. Those are Phases 1–12, and the foundation exists to
make them buildable without repeatedly rewriting what is underneath.

| | |
|---|---|
| Tests | 256 passing across 13 suites |
| Type-check | clean |
| Lint | clean |
| Build | succeeds — 6 routes |
| Vulnerabilities | 0 |
| Divisions | 35 registered · 7 prepared · 28 planned |
| Domain features | **0 — by design** |

Status vocabulary used throughout: ✅ implemented · 🟡 prepared · 🔴 not built.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No database and no API keys are required. The foundation runs standalone and
reports missing infrastructure honestly rather than faking it.

```bash
npm run verify       # typecheck + lint + test — the CI gate
```

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript, strict, `noUncheckedIndexedAccess` |
| Database | PostgreSQL via Prisma *(schema authored; no migration run)* |
| Styling | Tailwind CSS v4 + a token-driven design system |
| Validation | Zod |
| Testing | Vitest + Testing Library + happy-dom |

Chosen after an audit found the repository **completely empty** — see
[`docs/AUDIT-REPORT.md`](./docs/AUDIT-REPORT.md) for the reasoning and the
alternatives rejected.

---

## Layout

```
src/
  app/            routes — pages and /api/v1 handlers
  registry/       the architecture, machine-readable and CI-validated
  platform/       shared foundation: auth, RBAC, errors, money, i18n, events…
  design-system/  tokens and accessible component primitives
  plugins/        plugin kernel
prisma/           foundation schema
tests/            256 tests across 13 suites
docs/             Constitution, architecture, security, testing
scripts/          documentation generators and reporting helpers
```

---

## The five pillars

Every feature must map to at least one. A feature mapping to none does not
belong — and the registry integrity test enforces it rather than trusting
discipline.

**LEARN** · **DISCOVER** · **TRUST** · **CONNECT** · **BOOK**

---

## Three ideas worth knowing before contributing

**1. The registry is executable architecture.**
`src/registry/` holds divisions, modules, permissions, events and flags as typed
data, validated in CI. It is not documentation *about* the system — it drives
real behaviour. An unregistered permission denies. An unregistered event name is
rejected. An unknown feature flag resolves to disabled.

**2. Nothing fakes success.**
Every external capability is a port with no adapter in Phase 0. Calling one
returns a typed `NOT_CONFIGURED` error, never a fabricated result. A fake "email
sent" is indistinguishable from a real one until a patient misses an
appointment.

**3. Status is reported honestly.**
Documentation distinguishes implemented, prepared and not-built. Overstating
progress is the most serious process violation here, because every later
decision compounds on it.

---

## Documentation

Start with the [Constitution](./docs/constitution/CONSTITUTION.md) — it is the
governing specification, and it wins over any other document or any line of
code. Then the [documentation index](./docs/README.md).

---

## Commands

| | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run verify` | typecheck + lint + test |
| `npm test` | Test suite |
| `npm run registry:validate` | Architecture integrity |
| `npm run docs:divisions` | Regenerate the division map from the registry |
| `npm run db:migrate` | Create and apply a migration |
