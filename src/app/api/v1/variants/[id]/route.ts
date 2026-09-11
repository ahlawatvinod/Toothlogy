/**
 * TL-API-VARIANT-UPDATE-001 — PATCH /api/v1/variants/:id
 *   { label?, sku?, priceMinor?, available?, status? }
 *
 * Change a variant or take it off sale. Checks tl.marketplace.catalogue.manage.
 */

import { updateVariant, variantUpdateSchema } from '@/platform/marketplace/orders';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-VARIANT-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: variantUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Variant id is required.');
    return jsonSafe(await updateVariant(principal, params.id, body, { requestId }));
  },
});
