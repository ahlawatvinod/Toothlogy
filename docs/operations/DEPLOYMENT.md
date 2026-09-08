# Toothlogy Deployment & Operations

**Document ID:** `TL-DOC-DEPLOYMENT-001`
**Division:** 35 — DevOps & System

---

## 1. Local development

```bash
npm install
cp .env.example .env.local     # optional — the foundation runs without it
npm run dev                    # http://localhost:3000
```

**The foundation runs with no database and no providers.** That is deliberate: a
new contributor should be able to clone, install and see the app work without
provisioning anything. Missing infrastructure is reported honestly — the health
endpoint returns `unhealthy` and names what is absent — rather than faked.

### With PostgreSQL

`psql` is not required on the host; Docker is sufficient.

```bash
docker run --name toothlogy-db -e POSTGRES_PASSWORD=<choose-one> \
  -e POSTGRES_DB=toothlogy -p 5432:5432 -d postgres:17

# then set DATABASE_URL in .env.local
npm run db:generate
npm run db:migrate
```

> Pick your own password and put it in `.env.local` only. Never commit it, and
> never reuse a development password in any other environment.

---

## 2. Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Full test suite |
| `npm run verify` | **typecheck + lint + test — the CI gate** |
| `npm run registry:validate` | Architecture integrity only |
| `npm run db:migrate` | Create and apply a migration (dev) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:validate` | Validate the Prisma schema |

---

## 3. Environments

| | development | test | production |
|---|---|---|---|
| `DATABASE_URL` | optional | optional | **required** |
| `SESSION_SECRET` | optional | optional | **required, ≥32 chars** |
| HSTS | off | off | on |
| Uncertified flags | on/dev | on | **disabled** |
| Verbose health detail | on | on | off |
| Error stacks in logs | yes | yes | no |

Production requirements are enforced at boot by `getServerConfig()`, which
throws on a missing required variable — failing at startup rather than at the
first request that needs a database.

Validation is **lazy**, not at module load, so `next build` does not require
production secrets. A build that demands production credentials is how those
credentials end up in CI environments that should never have them.

---

## 4. Deploy checklist

**Before:**

1. `npm run verify` passes.
2. `npm run build` succeeds.
3. Migrations reviewed — **is every one reversible?**
4. New feature flags default to `disabled` in production.
5. `SESSION_SECRET` set, unique to the environment, ≥32 characters.
6. No new secret appears in source (`tests/security/secrets.test.ts` covers
   this, but check the diff too).

**Deploy:** `npm run db:deploy` → deploy the build → verify
`GET /api/v1/health`.

**After:** confirm health is `healthy`; watch error rates; enable new flags
deliberately, one at a time, only after certification.

---

## 5. Health checks

`GET /api/v1/health`

| Probe | Use |
|---|---|
| Liveness | Is the process alive? Failure → restart |
| Readiness | Can it serve now? Failure → remove from the load balancer |

Conflating the two causes a specific outage: if a database blip fails the
*liveness* check, the orchestrator restarts every instance at once, turning a
brief dependency wobble into a full outage with a cold start. A dependency being
down makes the service **not ready**, never **not alive**.

Dependency detail requires `tl.devops.health.read` **and** the
`verbose_health_check` flag. Dependency topology is useful to an operator and
equally useful to an attacker.

Provider checks report **configuration, not reachability**. Pinging vendors on
every health probe would turn a load balancer's liveness check into sustained
third-party traffic, and make our availability depend on theirs during the very
check meant to protect us. Reachability belongs in periodic background
monitoring.

---

## 6. Observability

- **Structured JSON logs**, one object per line, with automatic redaction of
  secrets and PHI. Redaction happens in the logger, not at call sites, because a
  rule that says "remember not to log the password" will be broken during an
  incident — exactly when logs are read most widely.
- **Request IDs** on every log line, error response and audit event.
- **Audit events** are distinct from logs: durable, immutable, compliance-grade.
- 🟡 Error tracking is a port with no adapter. Scrubbing runs before dispatch, so
  a crash report cannot become a data leak.

🔴 Not yet built: metrics/tracing export, dashboards, alert rules, log
aggregation, uptime monitoring — Phase 1.

---

## 7. CI

`.github/workflows/ci.yml` runs `npm run verify` plus `npm run build` and
`prisma validate` on every push and pull request. No deployment is configured;
that lands with the hosting decision in Phase 1.

---

## 8. Backup and recovery

🔴 **NOT IMPLEMENTED.** Owned by Phase 1, and listed here because an unstated
gap is indistinguishable from an oversight.

Required before any real patient data exists:

- Automated daily backups with point-in-time recovery.
- **Restore drills** — an untested backup is a hypothesis, not a backup.
- Documented RPO and RTO.
- Encrypted backups with separate key custody.
- Retention aligned to per-country requirements (Division 33).

---

## 9. Hosting

🔴 **Not yet decided.** The application is a standard Next.js server build with
one PostgreSQL dependency and no host-specific APIs, so the choice stays open.
Requirements to weigh in Phase 1: data residency for the Indian market
(DPDP Act), managed Postgres with point-in-time recovery, and a path to
region-local deployment for Phase 12.
