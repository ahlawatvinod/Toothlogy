/**
 * TL-API-DISTRICT-LIST-001   — GET  /api/v1/admin/districts?regionId=
 * TL-API-DISTRICT-IMPORT-001 — POST /api/v1/admin/districts { countryCode, rows: [{ state, district, lgdCode?, aliases? }] }
 *
 * Districts with their counts; importing an authoritative list (LGD). Import
 * is idempotent and turns a new spelling of an existing district into an
 * alias, never a second district.
 */

import { districtImportSchema, importDistricts, listDistricts } from '@/platform/india-data/districts';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-DISTRICT-LIST-001',
  permissions: ['tl.data.extraction.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ url }) => ({ districts: await listDistricts({ regionId: url.searchParams.get('regionId') ?? undefined }) }),
});

export const POST = defineRoute({
  id: 'TL-API-DISTRICT-IMPORT-001',
  permissions: ['tl.data.geography.manage'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: districtImportSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => importDistricts(principal, body, { requestId }),
});
