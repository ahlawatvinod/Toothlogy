/**
 * TL-API-RETURN-REQUEST-001 — POST /api/v1/orders/:id/returns
 *   { reason, details?, lines: [{ orderLineId, quantity }] }
 *
 * The buyer asks to return delivered items within the seller's return window.
 * One return in progress per order.
 */

import { requestReturn, returnRequestSchema } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RETURN-REQUEST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: returnRequestSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Order id is required.');
    return jsonSafe(await requestReturn(principal, params.id, body, { requestId }));
  },
});
