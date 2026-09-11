/**
 * TL-API-CART-REMOVE-001 — DELETE /api/v1/me/cart/:id
 *
 * Remove one line from the signed-in buyer's own cart.
 */

import { removeCartItem } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  id: 'TL-API-CART-REMOVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Cart line id is required.');
    return removeCartItem(principal, params.id);
  },
});
