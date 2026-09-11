/**
 * TL-API-QUOTE-REQUEST-001 — POST /api/v1/products/:id/quotes { quantity, message?, deliveryDistrictId?, buyerOrganizationId? }
 *
 * A signed-in buyer with a verified email asks the seller for a quote. One
 * open request per product; rate-limited as costly — it notifies the seller.
 */

import { quoteRequestSchema, requestQuote } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-QUOTE-REQUEST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: quoteRequestSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Product id is required.');
    return requestQuote(principal, params.id, body, { requestId });
  },
});
