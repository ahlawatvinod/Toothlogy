/**
 * TL-API-MY-ORDERS-001   — GET  /api/v1/me/orders
 * TL-API-ORDER-PLACE-001 — POST /api/v1/me/orders
 *   { sellerOrganizationId, buyerOrganizationId?, deliveryName, deliveryPhone,
 *     deliveryAddress, deliveryDistrictId, buyerTaxIdentifier?, buyerNote? }
 *
 * The buyer's orders, and placing the order for everything in the cart from
 * one seller. Requires an Idempotency-Key: a retried checkout returns the
 * first order rather than placing a second.
 */

import { checkoutSchema, myOrders, placeOrder } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-ORDERS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe(await myOrders(principal)),
});

export const POST = defineRoute({
  id: 'TL-API-ORDER-PLACE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: checkoutSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => jsonSafe(await placeOrder(principal, body, { requestId })),
});
