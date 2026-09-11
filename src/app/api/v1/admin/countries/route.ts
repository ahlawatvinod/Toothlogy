/**
 * TL-API-COUNTRIES-ADMIN-001 — GET /api/v1/admin/countries
 *
 * Every modelled country, open or closed, with its readiness checks and how
 * many organizations it has (tl.admin.country.manage).
 */

import { defineRoute } from '@/platform/http/handler';
import { listCountries } from '@/platform/globalization/countries';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-COUNTRIES-ADMIN-001',
  permissions: ['tl.admin.country.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ countries: await listCountries(principal) }),
});
