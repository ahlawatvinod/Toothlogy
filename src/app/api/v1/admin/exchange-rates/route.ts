/**
 * TL-API-FX-RATES-001       — GET  /api/v1/admin/exchange-rates
 * TL-API-FX-RATE-RECORD-001 — POST /api/v1/admin/exchange-rates
 *   { baseCurrency, quoteCurrency, rate, source, asOf }
 *
 * Exchange rates staff record with their source and date
 * (tl.admin.fx_rate.manage). Used only for labelled approximate totals in
 * platform reports — never to price or convert anyone's money.
 */

import { listRates, rateSchema, recordRate } from '@/platform/globalization/exchange-rates';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-FX-RATES-001',
  permissions: ['tl.admin.fx_rate.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe(await listRates(principal)),
});

export const POST = defineRoute({
  id: 'TL-API-FX-RATE-RECORD-001',
  permissions: ['tl.admin.fx_rate.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: rateSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => recordRate(principal, body, { requestId }),
});
