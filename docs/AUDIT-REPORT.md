# Toothlogy — Initial Architecture Audit Report

**Date:** 2026-09-08
**Scope:** Prompt 1, §1 (Audit the existing project)
**Auditor:** Foundation build
**Working directory:** `c:\Users\ahlaw\Desktop\TOOTHLOGY`

---

## 1. Executive summary

**The repository was empty.** No source files, no hidden files, no VCS metadata, no
configuration of any kind existed at audit time.

```
$ ls -A                 # (no output)
$ find . -mindepth 1 | wc -l
0
```

Consequently, the audit obligations in Prompt 1 §1.3–§1.7 — *"identify existing working
functionality"*, *"determine what can safely be reused"*, *"do not replace working
architecture"*, *"preserve backward compatibility"* — **have no subject matter**. There is
nothing to preserve, nothing to reuse, and no backward-compatibility surface. This is a
greenfield build, and the record must say so plainly rather than manufacture findings.

This document is retained permanently as the Phase 0 baseline: it is the evidence that the
foundation described in the rest of `docs/` was designed deliberately, not inherited.

---

## 2. Audit findings, item by item

Each row answers the checklist in Prompt 1 §1.2 against the repository **as found**.

| Dimension | Found in repo | Decision for the foundation |
|---|---|---|
| Framework | none | Next.js 15 (App Router) |
| Frontend | none | React 19 + TypeScript, Tailwind CSS v4 |
| Backend | none | Next.js Route Handlers under `/api/v1` |
| Database | none | PostgreSQL |
| ORM | none | Prisma |
| Authentication | none | Session-based core in `src/platform/auth` |
| API architecture | none | Versioned REST, shared envelope + error contract |
| Routing | none | App Router, file-based, locale-segmented |
| State management | none | Server Components first; client state kept local |
| Storage | none | Provider-abstracted file storage port |
| Existing modules | none | Registry seeded, no domain modules implemented |
| Existing pages | none | Only foundation pages (home, health, error, 404) |
| Existing components | none | Design-system primitives only |
| Existing integrations | none | Ports defined; no external providers wired |
| Environment config | none | `.env.example` + validated `src/platform/config` |
| Deployment config | none | Documented in `docs/operations/DEPLOYMENT.md` |
| Testing infrastructure | none | Vitest + foundation test suite |
| CI/CD | none | GitHub Actions workflow (build/lint/typecheck/test) |
| Design system | none | Token-driven system in `src/design-system` |

### Incomplete / duplicated / deprecated / conflicting architecture

**None found** — there was no code. This is the one section of the audit that a real
brownfield audit would normally carry, and its emptiness here is the finding.

---

## 3. Stack decision and rationale

The stack was not discoverable from the repository, so it was **confirmed with the project
owner** rather than assumed. Selected: **Next.js 15 + TypeScript + Prisma + PostgreSQL**,
built as a **modular monolith**.

Why this fits the Toothlogy Constitution specifically:

- **DISCOVER pillar is SEO-critical.** Dentist, clinic, treatment and location pages must be
  server-rendered and indexable. Next.js server components make this the default rather than
  an optimisation added later.
- **One language across the contract boundary.** Registries, API contracts, permissions and
  events are shared TypeScript, so a rename cannot silently desynchronise client and server.
- **PostgreSQL matches the domain.** Appointments, payments and clinical records are
  relational and demand transactional integrity; PostGIS serves the §14 location foundation;
  `NUMERIC` serves money exactly; `JSONB` carries per-country configuration without schema
  churn per market.
- **Modular monolith, not microservices.** Division boundaries are enforced in code and
  registry now, so any division can later be extracted to its own service without a rewrite.
  Twelve phases of business logic do not need distributed-systems overhead on day one.

### Rejected alternatives

- **NestJS + Next.js monorepo** — cleaner service separation, but two deploy targets and a
  duplicated contract layer slow every one of the 12 phases for a benefit the modular
  monolith defers rather than forfeits.
- **Django + DRF + React** — strong admin, but splits the codebase across two languages and
  gives up shared typed contracts between API and UI.
- **MySQL / MongoDB** — weaker geospatial support and, for MongoDB, a poor fit for the
  strongly relational appointment/payment/records core.

---

## 4. Toolchain verified present

| Tool | Version |
|---|---|
| Node.js | v22.9.0 |
| npm | 10.8.3 |
| Git | 2.46.2.windows.1 |
| Docker | 29.4.3 |
| Python | 3.12.6 |

`psql` is **not** on PATH. A local PostgreSQL is therefore expected to run via Docker; see
`docs/operations/DEPLOYMENT.md`. No database connection is required to build, lint,
type-check or run the foundation test suite.

---

## 5. Consequences for later prompts

1. There is **no legacy migration burden** — subsequent phases may adopt the conventions in
   `docs/architecture/` without compatibility shims.
2. Every convention in this repository is **newly authored and therefore changeable now, and
   expensive to change later.** Objections to the API envelope, ID scheme, RBAC model or
   division boundaries are cheapest to raise before Phase 1 begins.
3. The audit checklist in §1 should be **re-run at the start of each subsequent prompt**
   against the then-current repository. From Prompt 2 onward it becomes a real brownfield
   audit with genuine reuse and compatibility obligations.
