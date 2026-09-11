/**
 * TL-API-PRIME-AUTO-RENEW-001 — POST /api/v1/memberships/:id/auto-renew  { autoRenew }
 *
 * Turn a current Prime period's renewal on or off. Off keeps the period to its
 * end; nothing is refunded. Checks tl.prime.membership.manage.
 */

import { autoRenewSchema, setAutoRenew } from '@/platform/prime/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PRIME-AUTO-RENEW-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: autoRenewSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Membership id is required.');
    return setAutoRenew(principal, params.id, body, { requestId });
  },
});
