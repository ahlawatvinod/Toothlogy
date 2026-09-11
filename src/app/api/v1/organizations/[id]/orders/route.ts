/**
 * TL-API-SELLER-ORDERS-001 — GET /api/v1/organizations/:id/orders
 *
 * A business's orders with counts by status. Checks tl.marketplace.order.read
 * on the business; anyone else is told it does not exist.
 */

import { sellerOrders } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-SELLER-ORDERS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await sellerOrders(principal, params.id));
  },
});
