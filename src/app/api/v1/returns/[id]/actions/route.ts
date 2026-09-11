/**
 * TL-API-RETURN-ACTION-001 — POST /api/v1/returns/:id/actions
 *   seller: { action: APPROVE, note? } | { action: REJECT, note } | { action: RECEIVED, note? }
 *   buyer:  { action: CANCEL }
 *
 * Marking the items received issues the credit note; the refund is then
 * recorded as a payment against the return.
 */

import { actOnReturn, returnActionSchema } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RETURN-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: returnActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Return request id is required.');
    return actOnReturn(principal, params.id, body, { requestId });
  },
});
