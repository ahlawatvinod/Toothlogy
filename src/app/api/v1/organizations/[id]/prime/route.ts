/**
 * TL-API-PRIME-CONSOLE-001 — GET  /api/v1/organizations/:id/prime
 * TL-API-PRIME-BUY-001     — POST /api/v1/organizations/:id/prime  { planId }
 *
 * An organization's Prime membership, the plans on sale to it with their
 * price and tax, and buying a period from the lead wallet
 * (tl.prime.membership.manage on the organization). Requires an
 * Idempotency-Key, so a retried purchase is charged once.
 */

import { buyMembership, buySchema, primeConsole } from '@/platform/prime/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRIME-CONSOLE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await primeConsole(principal, params.id));
  },
});

export const POST = defineRoute({
  id: 'TL-API-PRIME-BUY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: buySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await buyMembership(principal, params.id, body, { requestId }));
  },
});
