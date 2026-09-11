/**
 * TL-API-LEAD-DISPUTE-001 — POST /api/v1/leads/:id/dispute { reason, note? }
 *
 * Dispute a lead charge within the dispute window. Decided by staff.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { disputeSchema, raiseDispute } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-LEAD-DISPUTE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: disputeSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Lead id is required.');
    const dispute = await raiseDispute(principal, params.id, body, requestId);
    return { disputeId: dispute.id, status: dispute.status };
  },
});
