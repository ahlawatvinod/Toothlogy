/**
 * TL-API-BILLING-CREDIT-001 — POST /api/v1/admin/billing/credits
 *
 * Staff record money received outside the platform, with its reference.
 * Leads waiting for funds are charged straight after.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { creditSchema, creditWallet } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-BILLING-CREDIT-001',
  permissions: ['tl.billing.ledger.adjust'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: creditSchema,
  audit: true,
  handler: async ({ principal, body, request, requestId }) => {
    const idempotencyKey = request.headers.get('idempotency-key');
    if (!idempotencyKey) throw errors.validation('An Idempotency-Key header is required for a credit.');
    const { entry, retried } = await creditWallet(principal, body, { idempotencyKey, requestId });
    return jsonSafe({ entryId: entry.id, balanceAfterMinor: entry.balanceAfterMinor, leadsCharged: retried });
  },
});
