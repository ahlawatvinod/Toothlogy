/**
 * TL-API-PRODUCT-UPDATE-001 — PATCH /api/v1/products/:id
 *
 * Edit, publish or archive a product. Checks tl.marketplace.catalogue.manage
 * on the product's business.
 */

import { productUpdateSchema, updateProduct } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-PRODUCT-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: productUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Product id is required.');
    const product = await updateProduct(principal, params.id, body, { requestId });
    return { productId: product.id, status: product.status };
  },
});
