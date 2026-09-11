/**
 * TL-API-CART-GET-001 — GET  /api/v1/me/cart
 * TL-API-CART-SET-001 — POST /api/v1/me/cart  { productId, variantId?, quantity }
 *
 * The signed-in buyer's cart, grouped by seller at current prices; adding an
 * item again sets its quantity.
 */

import { cartItemSchema, myCart, setCartItem } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CART-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe(await myCart(principal)),
});

export const POST = defineRoute({
  id: 'TL-API-CART-SET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: cartItemSchema,
  audit: false,
  handler: async ({ principal, body }) => setCartItem(principal, body),
});
