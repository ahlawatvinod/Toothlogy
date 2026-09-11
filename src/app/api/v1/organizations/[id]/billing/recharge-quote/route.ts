/**
 * TL-API-BILLING-RECHARGE-QUOTE-001 — GET /api/v1/organizations/:id/billing/recharge-quote?leads=N
 *
 * What prepaying N paid leads costs: N × the lead price, the GST those leads
 * carry, and the total payable — with the configured minimum. Defaults to the
 * minimum recharge.
 */

import { rechargeQuote } from '@/platform/billing/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-BILLING-RECHARGE-QUOTE-001',
  permissions: ['tl.billing.wallet.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  audit: false,
  handler: async ({ params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const raw = url.searchParams.get('leads');
    const leads = raw === null || raw === '' ? undefined : Number(raw);
    if (leads !== undefined && !Number.isInteger(leads)) throw errors.validation('leads must be a whole number.', { field: 'leads' });
    return jsonSafe(await rechargeQuote(params.id, leads));
  },
});
