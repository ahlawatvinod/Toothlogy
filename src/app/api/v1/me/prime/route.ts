/**
 * TL-API-PRIME-INDIVIDUAL-BUY-001 — POST /api/v1/me/prime  { planId }
 *
 * A person buys an individual Prime plan. It needs a payment provider: this
 * answers 503 NOT_CONFIGURED until one is connected, and creates no
 * membership without a verified payment.
 */

import { buyIndividualMembership, buySchema } from '@/platform/prime/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PRIME-INDIVIDUAL-BUY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: buySchema,
  audit: true,
  handler: async ({ principal, body }) => buyIndividualMembership(principal, body),
});
