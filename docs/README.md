# Toothlogy Documentation

**Phase 0 — Constitution & Architecture.**

Documentation here describes what the code **actually does**. Anything not yet
built is marked 🔴 with the phase that owns it. Claiming unimplemented
functionality is the most serious process violation in this repository
(Constitution P9), because every later decision compounds on it.

---

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [Constitution](./constitution/CONSTITUTION.md) | What Toothlogy is, and the rules that settle arguments |
| 2 | [Architecture](./architecture/ARCHITECTURE.md) | How the system is shaped, and why a modular monolith |
| 3 | [Phases](./architecture/PHASES.md) | The 13 phases and their dependencies |
| 4 | [Divisions](./architecture/DIVISIONS.md) | All 35 capability domains |
| 5 | [ID scheme](./architecture/ID-SCHEME.md) | How every object is named, permanently |

## Reference

| Document | Covers |
|---|---|
| [API, data & events](./architecture/API-AND-DATA.md) | Envelope, errors, pagination, schema conventions, event rules |
| [Globalization](./architecture/GLOBALIZATION.md) | Multi-country, money, time, RTL, tax, compliance |
| [Plugins & tools](./architecture/PLUGINS-AND-TOOLS.md) | Extension model and the 24 shared tools |
| [Security](./security/SECURITY.md) | Auth, RBAC, headers, secrets, audit, threat model |
| [Design system](./design-system/DESIGN-SYSTEM.md) | Tokens, theming, accessibility, RTL, components |
| [Testing strategy](./testing/TESTING-STRATEGY.md) | What the 256 tests prevent, and what is missing |
| [Certification standard](./testing/CERTIFICATION-STANDARD.md) | The 21 dimensions and the benchmarking procedure |
| [Deployment](./operations/DEPLOYMENT.md) | Environments, commands, health checks, CI |
| [Build status](./BUILD-STATUS.md) | **What actually works today, phase by phase** |
| [Audit report](./AUDIT-REPORT.md) | The Phase 0 baseline: the repository was empty |
| [Amendments](./constitution/AMENDMENTS.md) | Every change to the Constitution |

---

## The registry is also documentation

`src/registry/` holds the architecture in machine-readable form, and it is
validated in CI. Where this documentation and the registry disagree, **the
registry is right** — it is the one that fails a test when it becomes wrong.

```bash
npm run registry:validate      # architecture integrity
```

At runtime, `GET /api/v1/registry` returns the live architecture, so a
discrepancy between these documents and the running system is detectable rather
than assumed away.

---

## Status legend

Used consistently across every document:

| | Meaning |
|---|---|
| ✅ IMPLEMENTED | Code exists, is wired up, and is covered by tests |
| 🟡 PREPARED | Contract, port or type exists; no working behaviour behind it |
| 🔴 NOT IMPLEMENTED | Registered or planned only; no code |
