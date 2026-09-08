# Toothlogy Globalization Architecture

**Document ID:** `TL-DOC-GLOBALIZATION-001`
**Governed by:** Constitution §4 and P5

> **India is the first market, never an architectural assumption.**
>
> The test of this document is Phase 12: opening a new country should be
> configuration and translation, not re-architecture. Every decision below
> exists to make that true.

---

## 1. The failure this prevents

The usual path is: build for one country, hard-code its currency symbol, its
address shape, its tax rate and its date format, then discover at expansion time
that those assumptions are spread across two hundred files. The rewrite costs
more than the original build.

So the rule is structural: **country, language, currency and timezone are inputs
to every layer, never constants.**

---

## 2. Reference data

One source of truth: [`src/registry/globalization.ts`](../../src/registry/globalization.ts),
materialised into the database in Phase 1.

No module may hard-code a country code, currency symbol or locale.

`enabled: false` means *"modelled and architecturally supported, not open for
onboarding yet"*. It is the switch that makes a new market a configuration
change. India is `enabled: true`; six other countries are modelled and switched
off.

---

## 3. Money

```ts
{ amountMinor: bigint, currency: 'INR' }    // ₹123.45 → 12345n
```

**Never a float.** `0.1 + 0.2 === 0.30000000000000004` in IEEE-754, and a
marketplace summing thousands of line items in floats will not reconcile against
its payment provider.

**`bigint`, not `number`.** JavaScript integers are exact only to 2^53 — about
₹90 trillion in paise. That sounds sufficient until someone aggregates lifetime
platform volume, and the failure mode is silent rounding rather than an error.

**Minor units come from the registry.** JPY has 0 decimal places. Code assuming
"cents are always 1/100" turns ¥1000 into ¥10 — already broken for one of the
world's largest economies.

**Allocation never loses a unit.** ₹10.00 split three ways is `3.34 / 3.33 /
3.33`, not three lots of `3.33` with a paisa vanishing. Across a million payouts
that difference is real money.

**Currencies never mix implicitly.** `add(inr, usd)` throws. An implicit
conversion needs a rate, a timestamp and a source — decisions belonging to the
caller, not to an arithmetic helper.

**Tax is basis points**, so 18% GST is exactly `1800` and no rate is
approximate. Rounding defaults to banker's rounding, because repeated `half_up`
biases totals upward and that bias accumulates in one direction.

---

## 4. Time

- **Stored in UTC, always.** Rendered in the *viewer's* timezone.
- `formatDateTime(value, locale, timeZone)` — **timezone is a required
  parameter.** There is no `formatDate(date)` overload that could quietly use
  the server's zone. An appointment shown in the wrong timezone is a missed
  appointment.
- Reminders are scheduled in the *patient's* zone, not the clinic's.

🔴 Business hours, holiday calendars and recurrence land with the Calendar tool
in Phase 4.

---

## 5. Language and direction

- Locale negotiated from `Accept-Language`, honouring quality values, with
  regional→base fallback so `pt-BR` matches an available `pt`.
- **Direction comes from the language registry**, not from CSS. RTL works
  because the architecture accounts for it.
- A missing translation returns **the key itself**. Ugly, findable, and
  impossible to mistake for finished work — an empty string would look done.
- The UI must survive **~2× text expansion**: German and Tamil routinely run far
  longer than English, and fixed-width buttons clip.
- Arabic and Urdu stay registered specifically to keep RTL exercised.

---

## 6. Addresses

Stored as **ordered lines plus a country-specific `components` map**, not fixed
columns:

```prisma
lines       String[]
components  Json?      // landmark, district, PO box — keyed by name
```

A fixed `street1 / street2 / state / zip` schema is an American address shape.
Japan orders largest-unit-first; Ireland has no postcode in the usual sense;
Indian addresses commonly need a landmark. A fixed schema silently excludes those
markets, and migrating addresses later is among the most painful data migrations
there is.

"Region", not "State" — *state* is Indian and American vocabulary; elsewhere it
is a province, prefecture, canton or county.

---

## 7. Tax

`taxRegime` on Country selects a strategy (`gst` · `vat` · `sales_tax` ·
`none`) — **a strategy key, not a rate.** Rates vary by state, product class and
date, and belong in per-country configuration.

🔴 The tax engine itself lands in Phase 9 with the marketplace.

---

## 8. Compliance

Per-country **configuration**, never per-country code branches. A
`if (country === 'IN')` in business logic is the beginning of a fork.

Known market-specific requirements, recorded now so they are designed for rather
than discovered:

| Market | Requirement | Phase |
|---|---|---|
| India | DLT-registered SMS templates | 1 |
| India | GST invoicing and HSN codes | 9 |
| India | DPDP Act — consent, retention, breach notice | 6 |
| EU/UK | GDPR — erasure, portability, lawful basis | 12 |
| EU/UK | VAT with reverse charge | 12 |
| US | HIPAA — BAAs, audit, encryption at rest | 12 |
| Gulf | Arabic RTL, VAT, data residency | 12 |

Consent is already modelled as purpose-scoped and revocable
(`Consent` / `ConsentPurpose`), which is the shape all of these regimes need.

---

## 9. What is implemented

| | Status |
|---|---|
| Reference registry, `enabled` switch | ✅ |
| Money: minor units, allocation, tax, formatting | ✅ |
| Locale negotiation, direction, message catalogues | ✅ |
| Locale-aware date, number, list, relative-time formatting | ✅ |
| RTL via logical properties throughout | ✅ |
| Address model supporting varied shapes | ✅ (schema; no migration run) |
| Public locale API | ✅ |
| Locale-prefixed routing | 🟡 flag `multi_locale_routing`, off |
| Translation catalogues beyond the foundation | 🔴 Phase 2 |
| Exchange rates, localized pricing | 🔴 Phase 12 |
| Tax engine | 🔴 Phase 9 |
| Local phone/address validation per country | 🔴 Phase 1 |
| Business hours, holiday calendars | 🔴 Phase 4 |

`multi_locale_routing` is off deliberately: shipping empty translations reads as
a broken product, not a global one.
