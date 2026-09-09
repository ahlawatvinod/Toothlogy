# Toothlogy Build Status

**Last verified:** 2026-09-09
**Delivered through:** Phase 3 of 12
**Enforced by:** `DELIVERED_THROUGH_PHASE` in [`src/registry/index.ts`](../src/registry/index.ts),
asserted by `tests/registry/registry-integrity.test.ts`

> This file states what actually works. Every claim below was exercised against
> a real PostgreSQL database and a running production build, not inferred from
> the code. Constitution P9 makes overstating progress the most serious process
> violation in this repository.

---

## Status vocabulary

| | Meaning |
|---|---|
| 🟢 IMPLEMENTED & VERIFIED | Working end to end, covered by tests, exercised against a real database |
| 🟡 EXTERNAL INTEGRATION PENDING | Our side works; no third-party provider is connected |
| 🟠 PARTIALLY IMPLEMENTED | Some of the phase's scope is built |
| 🔵 ARCHITECTED ONLY | Contract, port or schema exists; no behaviour |
| 🔴 NOT IMPLEMENTED | Not started |

---

## Phase summary

| Phase | Scope | Status |
|---|---|---|
| 0 | Constitution & architecture | 🟢 IMPLEMENTED & VERIFIED |
| 1 | Global platform core | 🟠 PARTIALLY IMPLEMENTED |
| 2 | Toothlogy experience | 🟠 PARTIALLY IMPLEMENTED |
| 3 | Dentist + clinic ecosystem | 🟠 PARTIALLY IMPLEMENTED |
| 4 | Discovery + appointment engine | 🔴 NOT IMPLEMENTED |
| 5 | Trust + communication | 🔴 NOT IMPLEMENTED |
| 6 | Patient health journey | 🔴 NOT IMPLEMENTED |
| 7 | Knowledge + research + community | 🔴 NOT IMPLEMENTED |
| 8 | Students + colleges + careers | 🔴 NOT IMPLEMENTED |
| 9 | Marketplace | 🔴 NOT IMPLEMENTED |
| 10 | Prime + advertising + growth | 🔴 NOT IMPLEMENTED |
| 11 | AI + IoT | 🔴 NOT IMPLEMENTED |
| 12 | Global expansion + enterprise | 🔴 NOT IMPLEMENTED |

---

## What works end to end

Three complete workflows, each verified against a live server and database.

### 1. Patient / user account

```
register → session cookie → account dashboard → change password
→ review devices → revoke a device → request deletion → cancel deletion
```

🟢 Registration writes a user, credential, role assignment, profile, notification
preferences and an outbox event **in one transaction** — verified to roll back
entirely on conflict. Passwords are scrypt-hashed. Login returns an identical
error for a wrong password and an unknown account, so the endpoint cannot
enumerate accounts.

### 2. Organization and branches

```
create organization → becomes administrator → add a branch with address,
coordinates and split-shift opening hours → invite a member →
member accepts → member has read but not manage
```

🟢 Cross-tenant authorization verified live: a member of clinic A receives 403
on clinic B, before and after joining their own. Staff receive 403 on manage.
The last administrator cannot be removed or demoted.

### 3. Dentist credential verification — the TRUST pillar

```
dentist profile → add qualification with council registration number →
submit → reviewer approves (2-year expiry) → still NOT public →
claim practice at a clinic → still NOT public → clinic confirms →
PUBLIC PROFILE LIVE → admin revokes → gone immediately
```

🟢 Verified live, including every negative case:

- a dentist holding the moderator role **cannot approve their own application** (403, audited as denied)
- a verified dentist is **not discoverable** without a confirmed, locatable practice
- a dentist **cannot self-confirm** their own practice claim (403)
- a moderator **cannot revoke** — that needs a separate administrator permission (403)
- revocation removes the public profile **immediately** and withdraws qualification badges
- adding a credential after approval **drops the badge** and returns the profile to review

---

## Phase detail

### Phase 0 — Constitution & Architecture 🟢

Constitution, 35-division registry, ID scheme, plugin kernel, design system,
error taxonomy, RBAC, money, i18n, geo maths, event bus, feature flags.
Registry integrity is machine-checked.

### Phase 1 — Global Platform Core 🟠

**Built:** database (43 tables, 3 migrations), authentication (registration,
login, logout, sessions, password reset, change, email/phone verification
tokens, account deletion with 30-day grace), organizations, invitations,
locations with business hours, holidays, tax configuration, in-app
notifications with delivery records and retry scheduling, persistent
rate limiting, persistent idempotency, database audit log, seeded reference
data (7 countries, 36 Indian regions, 25 cities, 12 specialties).

**Not built:** MFA/TOTP enrolment 🔵, file upload 🔵 (ports only), full-text
search adapter 🔵 (table, trigger and GIN index exist; no query layer),
geocoding 🟡, outbox relay worker 🔴.

**External integrations:** 🟡 all eleven ports exist, **zero adapters
configured**. Email, SMS, WhatsApp, push, payments, storage, maps, search,
analytics, AI and error tracking each return a typed `NOT_CONFIGURED` error.
Nothing fakes success — verified by 21 tests.

### Phase 2 — Toothlogy Experience 🟠

**Built:** application shell with header/footer/skip link, light/dark/system
theming applied before first paint, register/login/forgot/reset/verify flows,
account dashboard, security page, organization management UI, about, privacy,
terms, contact, 5 honest "not built yet" pages, SEO metadata, structured data
on public dentist profiles.

🟢 **Public site visual identity.** The brand mark is vector and transparent
(`public/brand/toothlogy-mark.svg`, served as the favicon from
`src/app/icon.svg`); the palette is derived from it. The home page, header,
footer, "not built yet" pages and auth screens were rebuilt on the token layer,
with scroll-reveal motion that is disabled under `prefers-reduced-motion` and
never hides content from a visitor without JavaScript. Verified at 320–1920px
with no horizontal overflow on any public page.

**What the redesign deliberately did NOT add:** no hero search field, no dentist
result cards, no star ratings, no patient-count statistics. Discovery is Phase 4
and reviews are Phase 5. Every figure on the home page is counted from the
registry or the specialty list as the page renders, so none of them can be
wrong (P9); the animated counters animate a value they were given and cannot
invent one.

🟡 **Approved image assets.** The registry, resolution, sync/audit tooling and
the image components are built and tested; **none of the 70 approved
photographs exist**, so every surface that would show one currently renders
nothing at all — never a placeholder or a stock substitute. `npm run
assets:audit` lists what is outstanding; drop the files into
`public/brand/{banners,services}` named after their slug and run `npm run
assets:sync`. 🟡 rather than 🔴 because our side works and no third-party
content is connected, which is the same state as an unwired provider.

**Not built:** PWA manifest and service worker 🔴, locale-prefixed routing 🔵
(flag exists, off), account preferences UI 🔴, saved items 🔴.

### Phase 3 — Dentist + Clinic Ecosystem 🟠

**Built:** dentist profiles with qualifications, specialties, languages, fees
and practice locations; the full DRAFT → SUBMITTED → VERIFIED → SUSPENDED
lifecycle; evidence-backed, expiring, revocable verification; a review console;
practice claims requiring clinic confirmation; public profile pages with
structured data.

🟠 **Treatment catalogue and dentist pricing.** The master catalogue (17
categories, 56 treatments, 39 variants, 181 search synonyms, 14 pricing units)
and a dentist's own price list, with clinic-specific overrides, deterministic
price display, append-only change history and a patient-facing view on the
public profile. Master catalogue and dentist pricing are separate tables, so
re-seeding market ranges cannot overwrite a price a dentist set (§6 of the
module spec), and a suggested range is never rendered without its label.

Descriptions are written for all 56 treatments and all 39 variants, and a
dentist may write their own wording per treatment or per variant. Those resolve
through a four-level fallback (dentist variant → dentist service → master
variant → master service), so no clinic is forced to duplicate text and a
correction to the master description reaches every clinic that has not
overridden it. A dentist's edit cannot reach the master record: the custom text
is a separate column on their own row, and no dentist-facing path writes to the
catalogue at all.

> **Not verified against a database.** The migrations
> `20260909120000_phase_3_treatment_catalogue_pricing` and
> `20260909180000_price_list_descriptions` have not been applied anywhere, and
> `tests/integration/pricing.test.ts` (26 tests covering ownership, IDOR,
> clinic isolation, scope fallback, price history, description ownership and
> fallback, and pagination) has never executed — it skips without
> `DATABASE_URL`, and no PostgreSQL was available in the environment it was
> written in. The 201 domain and UI tests do run. Until someone applies the
> migrations, seeds, and runs that integration suite green, this feature is 🟠
> and not 🟢, whatever the code looks like (Constitution P8).

**Not built:** clinic verification submission UI 🔵 (the model supports
organizations; only the dentist path has a UI), document upload for
certificates 🔵, dentist dashboard analytics 🔴, package pricing UI 🔵 (schema
and entities exist; no editor), CSV import/export wiring 🔵 (parser, serialiser
and bulk-change planner are built and tested; no route or button yet), master
catalogue admin UI 🔵 (the API exists; administration is API-only).

### Phases 4–12 🔴

Not started. Registered in the architecture with IDs, dependencies and pillars;
no code. The four anchor IDs from the founding specification
(`TL-DISCOVERY-DENTIST-001`, `TL-APPOINTMENT-BOOKING-001`,
`TL-PATIENT-RECORD-001`, `TL-MARKETPLACE-PRODUCT-001`) are reserved and
explicitly marked `planned`.

---

## Verification results

```
Type-check   clean
Lint         clean
Tests        335 passed, 16 suites
             ├─ unit:        13 suites
             └─ integration:  3 suites, against real PostgreSQL
Build        succeeded, 0 error log lines
Migrations   3 applied, 43 tables
Vulnerabilities  0
Doc links    all resolve
```

Integration tests run against a real database rather than a mocked ORM, because
a mock cannot verify a unique constraint, a transaction rollback, or the atomic
single-use token consumption that stops two people redeeming one password-reset
link.

---

## Known limitations

| Limitation | Consequence | Owner |
|---|---|---|
| No provider adapters | No email, SMS or payment leaves the platform | Phase 1 completion |
| Invitations return a link instead of emailing | Admin must share it manually | Phase 1 completion |
| No file upload | Certificates cannot be attached to verification | Phase 1 completion |
| No search query layer | Discovery cannot run | Phase 4 |
| No MFA enrolment | Password is the only factor | Phase 1 completion |
| No outbox relay | `USER_CREATED` rows accumulate unpublished | Phase 1 completion |
| No PWA | No offline or installable experience | Phase 2 completion |
| No automated a11y/visual regression | Accessibility asserted per-component, not per-page | Phase 2 completion |
| Nothing certified | The 21-dimension standard is defined, not yet applied | Prompt 3 |
