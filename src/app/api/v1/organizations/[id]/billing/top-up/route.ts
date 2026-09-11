/**
 * TL-API-BILLING-TOPUP-001 — POST /api/v1/organizations/:id/billing/top-up { amountMinor }
 *
 * Card/UPI top-up through the payment port. With no provider connected this
 * answers NOT_CONFIGURED (503) and credits nothing; the wallet is only ever
 * credited on a provider-confirmed payment or a staff-recorded transfer.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { startTopUp } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-BILLING-TOPUP-001',
  permissions: ['tl.billing.wallet.read'],
  authRequired: true,
  rateLimit: 'costly',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  bodySchema: z.object({
    amountMinor: z.coerce.bigint().refine((v) => v >= BigInt(10_000) && v <= BigInt(10_000_000), 'Top up between ₹100 and ₹1,00,000.'),
  }),
  audit: true,
  handler: async ({ principal, params, body, request }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const key = request.headers.get('idempotency-key');
    if (!key) throw errors.validation('An Idempotency-Key header is required for a top-up.');
    return startTopUp(principal, params.id, body.amountMinor, key);
  },
});
