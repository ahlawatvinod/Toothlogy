/**
 * TL-API-ORDER-PAY-ONLINE-001 — POST /api/v1/orders/:id/pay-online
 *
 * The buyer pays what is due through the payment port. While no payment
 * provider is connected this answers 503 NOT_CONFIGURED; it never marks an
 * order paid (Constitution P10).
 */

import { payOnline } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORDER-PAY-ONLINE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  audit: true,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Order id is required.');
    return payOnline(principal, params.id);
  },
});
