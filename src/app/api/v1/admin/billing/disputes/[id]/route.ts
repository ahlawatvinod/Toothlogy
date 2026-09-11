/**
 * TL-API-BILLING-DISPUTE-RESOLVE-001 — POST /api/v1/admin/billing/disputes/:id { decision, note }
 *
 * Uphold (refund, once) or reject. Never by the person who raised it.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { resolveDispute, resolveDisputeSchema } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-BILLING-DISPUTE-RESOLVE-001',
  permissions: ['tl.billing.dispute.resolve'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: resolveDisputeSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Dispute id is required.');
    const dispute = await resolveDispute(principal, params.id, body, requestId);
    return { disputeId: dispute.id, status: dispute.status };
  },
});
