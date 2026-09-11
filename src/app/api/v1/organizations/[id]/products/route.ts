/**
 * TL-API-PRODUCT-LIST-001   — GET  /api/v1/organizations/:id/products
 * TL-API-PRODUCT-CREATE-001 — POST /api/v1/organizations/:id/products
 *
 * A business's profile and catalogue, and adding a product or service (a
 * draft until published). Checks tl.marketplace.catalogue.manage.
 */

import { businessConsole, createProduct, productSchema } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRODUCT-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await businessConsole(principal, params.id));
  },
});

export const POST = defineRoute({
  id: 'TL-API-PRODUCT-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: productSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return createProduct(principal, params.id, body, { requestId });
  },
});
