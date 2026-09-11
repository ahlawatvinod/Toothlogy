/**
 * TL-API-ORDER-ACTION-001 — POST /api/v1/orders/:id/actions
 *   seller: { action: CONFIRM, note? } | { action: DECLINE, note } |
 *           { action: DISPATCH, carrier?, trackingReference?, note? } |
 *           { action: CANCEL, note } | { action: DELIVERED } | { action: ISSUE_INVOICE }
 *   buyer:  { action: CANCEL, note? } (before confirmation) | { action: DELIVERED }
 *
 * Dispatching issues the tax invoice if it has not been issued.
 */

import { actOnOrder, orderActionSchema } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORDER-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: orderActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Order id is required.');
    return actOnOrder(principal, params.id, body, { requestId });
  },
});
