# Toothlogy Architecture

**Document ID:** `TL-DOC-ARCHITECTURE-001`
**Phase:** 0 — foundation
**Governed by:** [`../constitution/CONSTITUTION.md`](../constitution/CONSTITUTION.md)

---

## 1. Shape of the system

Toothlogy is a **modular monolith**: one deployable application, with division
boundaries enforced in code and in the registry.

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 16 (App Router)                  │
│                                                             │
│  src/app/            routes — pages and /api/v1 handlers    │
│  src/design-system/  tokens + accessible primitives         │
│  src/platform/       the shared foundation (Division 01)    │
│  src/registry/       the architecture, machine-readable     │
│  src/plugins/        plugin kernel                          │
└──────────────────────────┬──────────────────────────────────┘
                           │  Prisma
                  ┌────────▼────────┐
                  │   PostgreSQL    │
                  └─────────────────┘
                           │  ports (no adapters in Phase 0)
   ┌───────────┬───────────┼───────────┬────────────┬─────────┐
 email        sms      payments     storage      maps      search
```

### Why a modular monolith and not microservices

Thirty-five divisions could suggest thirty-five services. That would be a
mistake at this stage, and the reasoning is worth recording because it will be
revisited:

- **The boundaries are not proven yet.** Division borders drawn in Phase 0 will
  move once real workflows exist. Moving a boundary inside one codebase is a
  refactor; moving it between services is a migration with a data split.
- **The dominant cost early is cross-cutting change.** Adding a field that
  touches identity, records and notifications is one commit here, and a
  coordinated multi-service release otherwise.
- **Distributed systems tax every feature.** Network partitions, retries,
  eventual consistency and distributed tracing are real costs paid on day one
  for a scale problem that does not exist yet.

The architecture keeps extraction available: divisions own their data, talk
through service interfaces rather than each other's tables, and communicate by
domain events. A division that outgrows the monolith can be lifted out without
rewriting its consumers.

---

## 2. Layers

Dependencies point **downward only**. A lower layer never imports an upper one.

| Layer | Path | Depends on | Rule |
|---|---|---|---|
| Routes | `src/app/` | everything below | No business logic; wire and delegate |
| Design system | `src/design-system/` | i18n only | No data fetching, no domain knowledge |
| Domain divisions | *(Phase 1+)* | platform, registry | Own their data; talk through interfaces |
| Platform | `src/platform/` | registry, kernel | No domain knowledge whatsoever |
| Registry | `src/registry/` | nothing | Pure data and types |

The rule that makes this hold: **the platform must not know what a dentist is.**
The moment `src/platform` contains a dental concept, every division inherits it
and the layering stops meaning anything.

---

## 3. Request lifecycle

Every API request follows the same path, enforced by `defineRoute`
([`src/platform/http/handler.ts`](../../src/platform/http/handler.ts)):

```
Request
  │
  ├─ 1. request ID + bound logger        every log line correlatable
  ├─ 2. feature flag gate                disabled → 404, never 403
  ├─ 3. resolve principal                anonymous by default
  ├─ 4. rate limit                       keyed by user, else IP
  ├─ 5. authentication                   401 if required and absent
  ├─ 6. permission check                 DEFAULT DENY → 403
  ├─ 7. body validation                  zod schema → 400 with field paths
  ├─ 8. handler                          the only division-specific code
  ├─ 9. audit event                      mutations, always
  ├─ 10. envelope + security headers
  └─ Response
```

Steps 5–6 are why this wrapper is not optional. Across hundreds of routes,
"remember to check permissions" is a rule that gets broken, and a missing check
looks identical to a route that is deliberately public. Here, permissions are
part of a route's *definition* — a public route says `permissions: []`, and
there is no way to express "did not think about it".

---

## 4. The registry as executable architecture

`src/registry/` holds the architecture in machine-readable form, validated in CI
by [`validate.ts`](../../src/registry/validate.ts).

This exists because architecture documents rot: nothing fails when they become
wrong. A validated registry cannot rot the same way. A module referencing a
deleted division, a role inheriting from a missing role, a duplicate ID, or an
endpoint requiring a permission it does not authenticate for — each fails a test
instead of surviving unnoticed until someone relies on it.

The registry also drives real behaviour rather than only describing it:

| Registry | Consumed by |
|---|---|
| `permissions`, `roles` | `can()` — an unregistered permission denies |
| `events` | the event bus — an unregistered name is rejected |
| `flags` | `isFlagEnabled()` — an unknown key resolves to disabled |
| `globalization` | money, i18n, locale negotiation |
| `flags` (config) | the logger's redaction list |
| `integrations` | `.env.example`, health checks |

Because it is data, it is also introspectable at runtime via
`GET /api/v1/registry` — so a discrepancy between the documentation and the
running system is detectable rather than assumed away.

---

## 5. Hexagonal boundary for external systems

Every external capability is a **port** (a TypeScript interface) filled by an
**adapter** at boot. No adapter is registered in Phase 0.

An empty slot returns a Proxy whose every method rejects with a typed
`NOT_CONFIGURED` error ([`provider.ts`](../../src/platform/integrations/provider.ts)).
This is the enforcement mechanism for Constitution P10, and it is the single
most important property of the integration layer: a fabricated "email sent" is
indistinguishable from a real one until a patient misses an appointment.

Using a Proxy rather than per-method guards means the protection covers methods
that do not exist yet — a port that grows a method in Phase 9 is protected
without anyone remembering to add a check.

---

## 6. Data flow between divisions

```
Division A ──── writes ────► its own tables
     │
     ├─── publishes ────► domain event ────► Division B subscribes
     │                    (via outbox)
     └─── reads ────────► Division B's service interface
```

Three rules:

1. **A division writes only its own tables.** Cross-division writes go through
   the owning division's service (Constitution P7).
2. **Events are facts, past tense, and carry IDs rather than sensitive bodies.**
   `MESSAGE_RECEIVED` carries thread and sender IDs — never message content.
3. **Durable events use the transactional outbox.** The event row is written in
   the same transaction as the state change, so an event can never be published
   for a change that rolled back — the failure that emails "your appointment is
   confirmed" for appointments that do not exist.

---

## 7. What exists today

| | Status |
|---|---|
| Registry, validation, introspection | ✅ IMPLEMENTED |
| Errors, IDs, config, logging, audit | ✅ IMPLEMENTED |
| RBAC, money, i18n, flags, events, location maths | ✅ IMPLEMENTED |
| HTTP conventions, design system, 3 API routes, 2 pages | ✅ IMPLEMENTED |
| Plugin kernel | ✅ IMPLEMENTED (no plugins exist) |
| Prisma schema — foundation models | ✅ IMPLEMENTED (no migration run) |
| Auth: password + OTP logic | ✅ IMPLEMENTED |
| Auth: session persistence, principal resolution | 🟡 PREPARED |
| All integration ports | 🟡 PREPARED — zero adapters |
| Every domain division (03–32) | 🔴 NOT IMPLEMENTED |

See [`PHASES.md`](./PHASES.md) for what comes next and in what order.
