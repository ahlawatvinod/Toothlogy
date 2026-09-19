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

### With MySQL

Any MySQL 8.0+ (or MariaDB 10.6+) you control. With Docker:

```bash
docker run --name toothlogy-db -e MYSQL_ROOT_PASSWORD=<choose-one> \
  -e MYSQL_DATABASE=toothlogy -p 3306:3306 -d mysql:8.0

# then set DATABASE_URL in .env.local (shape: see .env.example)
npm run db:generate
npm run db:deploy     # apply migrations
npm run db:seed       # reference data; safe to re-run
```

> Pick your own password and put it in `.env.local` only. Never commit it, and
> never reuse a development password in any other environment.

**`db:deploy` versus `db:migrate`.** `db:deploy` (`prisma migrate deploy`) only
ever applies pending migrations and is the ONLY migration command to run
against a database holding real data, including production. `db:migrate`
(`prisma migrate dev`) is for authoring a new migration against a disposable
local database: it needs a shadow database — which a Hostinger user cannot
create — and on drift it offers to reset, which deletes everything. `db:reset`
deletes everything unconditionally.

**Authoring a migration.** `prisma migrate dev` writes new tables with
`COLLATE utf8mb4_unicode_ci`. Change it to `utf8mb4_bin` before committing —
`tests/platform/migrations.test.ts` fails until you do, and the MYSQL
CONVENTIONS note at the top of `prisma/schema.prisma` explains why.

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

**Application:** Vercel. **Database:** MySQL on Hostinger (decided 2026-09-19).
🟡 **PREPARED, not live** — the production deployment has no `DATABASE_URL`
yet, so its health check reports the database `unhealthy`.

### Connecting Vercel to Hostinger MySQL

The application runs on Vercel and the database on Hostinger, so every query
crosses the public internet. That has four consequences to settle before go-live:

1. **Remote access must be switched on.** Hostinger MySQL accepts connections
   only from Hostinger's own servers by default. hPanel → Databases → Remote
   MySQL must allow the connecting host. Vercel functions have no fixed
   outbound IP on standard plans, so this generally means allowing any host
   (`%`) — which exposes port 3306 to the internet, protected only by the
   database password. Use a long random password, a user scoped to this one
   database, and TLS if Hostinger offers it for remote connections.
2. **Connection limits.** Each serverless instance opens its own pool and a
   shared host caps connections per user. Keep `connection_limit` small in the
   URL (see `.env.example`); "Too many connections" under load means it is set
   too high or the plan's cap is too low.
3. **Latency — functions are pinned to Mumbai.** The Hostinger server
   (`srv1645.hstgr.io`) is in Mumbai, and `vercel.json` sets `"regions":
   ["bom1"]` so the functions run there too. Without it Vercel runs functions
   in Washington, D.C. (`iad1`) by default — the page edge being Mumbai does
   not change that — and every query crossed the planet: about 300 ms per
   round trip, 10-second logins, and multi-step writes near their transaction
   limits. If the database ever moves, move this region with it. Check the
   live region with the `x-vercel-id` response header on any API route: it
   reads `edge::function-region::id`.
4. **Recovery.** Shared MySQL hosting generally offers periodic backups, not
   point-in-time recovery. Confirm the backup schedule and test a restore
   before real patient data is stored — the DPDP Act and the clinical-records
   phases make this a requirement, not an option.

### First deploy against a new Hostinger database

```bash
# From a machine allowed by Remote MySQL, with the production URL in the
# environment for this shell only — never in a file in the repository:
npx prisma migrate deploy   # creates the schema; non-destructive
npm run db:seed             # reference data; idempotent
```

Then set `DATABASE_URL` in Vercel → Settings → Environment Variables
(Production), redeploy, and confirm `/api/v1/health` reports the database
`healthy`.
