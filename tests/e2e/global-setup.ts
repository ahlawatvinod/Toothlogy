/**
 * Warm the routes the journeys use before any test starts.
 *
 * A development server compiles each page and API route on its first request,
 * which took 30–80 s per route under load in the 2026-09-11 certification and
 * made tests time out on their first visit. Requesting each route once here —
 * signed out, so API routes answer 401 or 404 but are compiled all the same —
 * moves that cost out of the tests. A production server answers at once.
 * Set E2E_SKIP_WARMUP=1 to skip.
 */

import type { FullConfig } from '@playwright/test';

const ROUTES = [
  '/', '/login', '/register', '/account', '/find?type=dentist', '/which-dentist', '/knowledge', '/careers', '/marketplace', '/colleges', '/community', '/help',
  '/account/appointments/apt_x', '/account/practice', '/account/practice/appointments/apt_x', '/account/practice/leads', '/account/practice/messages',
  '/account/records', '/account/articles', '/account/articles/art_x', '/account/camps', '/account/camps/new', '/account/quotes', '/account/orders', '/cart',
  '/account/organizations/x', '/account/organizations/x/campaigns', '/account/organizations/x/campaigns/cmp_x', '/account/organizations/x/equipment',
  '/account/organizations/x/service-contracts', '/account/organizations/x/products', '/account/organizations/x/business', '/account/organizations/x/orders',
  '/account/organizations/x/prime', '/account/organizations/x/enterprise', '/account/organizations/x/analytics', '/account/organizations/x/devices',
  '/admin/countries', '/admin/camps', '/admin/knowledge', '/admin/prime', '/admin/enterprise', '/admin/exchange-rates', '/admin/support', '/admin/data',
  '/dentists/x', '/clinics/x', '/book/x', '/rx/x',
  '/api/v1/appointments', '/api/v1/appointments/x/reschedule', '/api/v1/appointments/x/transitions', '/api/v1/leads/x/actions',
  '/api/v1/articles', '/api/v1/articles/x', '/api/v1/articles/x/submit', '/api/v1/camps', '/api/v1/camp-doctors/x', '/api/v1/camp-registrations/x',
  '/api/v1/organizations/x/campaigns', '/api/v1/campaigns/x/actions', '/api/v1/organizations/x/products', '/api/v1/products/x/quotes',
  '/api/v1/service-contracts/x/visits', '/api/v1/service-visits/x/actions', '/api/v1/me/cart', '/api/v1/me/orders', '/api/v1/orders/x/actions',
];

export default async function globalSetup(config: FullConfig) {
  if (process.env.E2E_SKIP_WARMUP) return;
  const baseURL = String(config.projects[0]?.use.baseURL ?? 'http://localhost:3020');
  for (const path of ROUTES) {
    await fetch(new URL(path, baseURL), { redirect: 'manual', signal: AbortSignal.timeout(240_000) })
      .then((response) => response.arrayBuffer())
      .catch(() => undefined);
  }
}
