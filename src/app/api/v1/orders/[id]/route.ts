/**
 * TL-API-ORDER-GET-001 — GET /api/v1/orders/:id
 *
 * One order for its buyer or the seller's people (tl.marketplace.order.read):
 * lines, history, payments recorded, tax documents and returns. Anyone else is
 * told it does not exist.
 */

import { getOrder } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ORDER-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Order id is required.');
    return jsonSafe(await getOrder(principal, params.id));
  },
});
