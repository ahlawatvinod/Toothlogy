/**
 * TL-API-VARIANT-CREATE-001 — POST /api/v1/products/:id/variants
 *   { label, sku?, priceMinor, available? }
 *
 * A size, shade or pack of a product at its own tax-inclusive price. Checks
 * tl.marketplace.catalogue.manage on the product's business.
 */

import { createVariant, variantSchema } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-VARIANT-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: variantSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Product id is required.');
    return createVariant(principal, params.id, body, { requestId });
  },
});
