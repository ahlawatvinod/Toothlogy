/**
 * TL-API-ORDER-PAYMENT-001 — POST /api/v1/orders/:id/payments
 *   { kind: RECEIPT | REFUND, method, amountMinor, receivedOn, reference?, note?, returnRequestId? }
 *
 * The seller records money it received for the order, or paid back. Toothlogy
 * moves no money; this is the seller's record, shown to the buyer as such.
 * Requires an Idempotency-Key, so a retried submission records once.
 */

import { orderPaymentSchema, recordOrderPayment } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORDER-PAYMENT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: orderPaymentSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Order id is required.');
    return recordOrderPayment(principal, params.id, body, { requestId });
  },
});
