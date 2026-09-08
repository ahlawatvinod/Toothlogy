# Toothlogy Plugins & Tools

**Document ID:** `TL-DOC-PLUGINSTOOLS-001`
**Governed by:** founding spec §23, §24 · Constitution §6

---

## Part 1 — Plugins

A **plugin** is an optional, independently loadable extension. Plugins exist so
future capabilities — a country-specific compliance pack, a partner integration,
an experimental discovery ranker — can be added without editing the core.

### The governing rule

> **A plugin declares; it does not reach in.**

A plugin's manifest lists the permissions, routes, APIs, entities, tools,
integrations, events, config and flags it needs. The kernel validates those
declarations against the registries and wires them. A plugin never imports
another plugin's internals — if it needs something, it declares a dependency and
the kernel guarantees load order.

That constraint is what stops a plugin system from becoming a second,
undisciplined codebase. Once plugins can reach into each other, load order
becomes load-bearing in ways nobody documented, and removing any plugin breaks
three others.

### Manifest

```ts
export const manifest: PluginManifest = {
  id: 'TL-PLG-GST-INDIA-001',
  name: 'India GST Compliance',
  version: '1.0.0',
  description: 'GST invoicing, HSN codes and e-invoice submission for India.',
  divisionId: 'TL-DIV-24-WALLET',
  phase: 9,

  dependsOn: [],
  permissions: ['tl.core.organization.manage'],   // must already exist
  routes: [{ path: '/billing/gst', permissions: ['tl.core.organization.manage'] }],
  apis: [{ method: 'POST', path: '/api/v1/billing/gst/invoice', permissions: [...] }],
  entities: ['GstInvoice'],
  tools: ['TL-TOOL-PDF-001'],
  integrations: ['TL-INT-STORAGE-001'],
  events: ['PAYMENT_COMPLETED'],
  config: ['GST_PORTAL_API_KEY'],                  // names only, never values
  flag: 'india_gst_compliance',
  tests: ['tests/plugins/gst-india.test.ts'],

  setup: async ({ logger }) => { /* wire providers, subscribe to events */ },
  teardown: async () => { /* release resources */ },
};
```

*Illustrative. No such plugin exists.*

### Validation at load, not at first use

Every manifest is validated **before any `setup` runs**, so a bad manifest never
leaves a partially loaded system behind. A plugin declaring a permission that
does not exist fails at startup — one clear error message — rather than at 2am
when a user first reaches the route.

**A plugin cannot invent permissions.** Permissions are reviewed centrally and
granted to roles; letting a plugin define its own would let it grant itself
access nobody approved.

### Load order

Topological sort over `dependsOn`. A cycle **throws** rather than picking an
arbitrary order: with a cycle, at least one plugin's `setup` runs before
something it needs, and the resulting failure appears somewhere unrelated to the
actual mistake. Teardown runs in reverse, so a dependent releases before its
dependency.

### Status

✅ IMPLEMENTED — manifest contract, validation, dependency resolution, load
ordering, lifecycle hooks
([`src/plugins/kernel.ts`](../../src/plugins/kernel.ts)).

🔴 NOT IMPLEMENTED — **no plugins exist**, and nothing is loaded at boot.
Registering a plugin that does not exist would be exactly the decorative
progress Constitution P9 forbids.

---

## Part 2 — Tools

A **tool** is a reusable cross-cutting capability that many modules consume.
Tools exist so capability is written once: a division that ships its own SMS
sender or PDF generator is a defect, not a preference (Constitution P7).

`requiresProvider: true` means the tool is a port with no built-in
implementation — it does nothing until an adapter is configured, and until then
returns a typed `NOT_CONFIGURED` error rather than faking success.

| ID | Tool | Status | Provider? | Phase |
|---|---|---|---|---|
| `TL-TOOL-CURRENCY-001` | Currency | ✅ | no | 1 |
| `TL-TOOL-TRANSLATION-001` | Translation | ✅ | no | 1 |
| `TL-TOOL-AUDIT-001` | Audit | ✅ | no | 1 |
| `TL-TOOL-LOCATION-001` | Location | 🟡 | no | 1 |
| `TL-TOOL-GEOFENCE-001` | Geofence | 🟡 | no | 1 |
| `TL-TOOL-SEARCH-001` | Search | 🟡 | yes | 1 |
| `TL-TOOL-FILE-001` | File | 🟡 | yes | 1 |
| `TL-TOOL-NOTIFICATION-001` | Notification | 🟡 | no | 1 |
| `TL-TOOL-EMAIL-001` | Email | 🟡 | yes | 1 |
| `TL-TOOL-SMS-001` | SMS | 🟡 | yes | 1 |
| `TL-TOOL-OTP-001` | OTP | 🟡 | yes | 1 |
| `TL-TOOL-ANALYTICS-001` | Analytics | 🟡 | yes | 1 |
| `TL-TOOL-GEOCODE-001` | Geocoding | 🟡 | yes | 4 |
| `TL-TOOL-PAYMENT-001` | Payment | 🟡 | yes | 4 |
| `TL-TOOL-MAP-001` | Map | 🔴 | yes | 4 |
| `TL-TOOL-GPS-001` | GPS | 🔴 | no | 4 |
| `TL-TOOL-CALENDAR-001` | Calendar | 🔴 | no | 4 |
| `TL-TOOL-IMAGE-001` | Image | 🔴 | yes | 3 |
| `TL-TOOL-VERIFICATION-001` | Verification | 🔴 | no | 3 |
| `TL-TOOL-PDF-001` | PDF | 🔴 | yes | 6 |
| `TL-TOOL-QR-001` | QR | 🔴 | no | 6 |
| `TL-TOOL-REPORTING-001` | Reporting | 🔴 | no | 10 |
| `TL-TOOL-AI-001` | AI | 🔴 | yes | 11 |
| `TL-TOOL-RECOMMENDATION-001` | Recommendation | 🔴 | yes | 11 |

24 tools registered: **3 implemented, 11 prepared, 10 planned.**

### Why geometry and geocoding are separate tools

Distance, radius search and geofencing are pure maths and live in
`src/platform/location` with **no provider dependency**. Geocoding and map tiles
need an external service and live behind ports.

The split matters: "find dentists within 5 km" must work from the database
alone. If radius search required a maps API, every discovery query would inherit
that vendor's latency, rate limit, per-call cost and outages — on the single most
important query in the product.

### Adding a tool

1. Register it in `src/registry/tools.ts` with an honest status.
2. Define the port in `src/platform/<domain>/ports.ts`.
3. Create a slot with `createProviderSlot<T>('name')` if it needs a provider.
4. Add its env vars to `src/registry/integrations.ts` — the `.env.example`
   template and health checks are generated from there.
5. Add a test proving that, unconfigured, it fails with `NOT_CONFIGURED` rather
   than succeeding.

Step 5 is not optional. It is the standing enforcement of Constitution P10.
