/**
 * TL-API-QUOTE-ACTION-001 — POST /api/v1/quotes/:id/actions
 *   seller: { action: QUOTE, priceMinor, validUntil, note? } | { action: DECLINE, note } | { action: CLOSE }
 *   buyer:  { action: ACCEPT } | { action: WITHDRAW }
 *
 * Anyone else is told the request does not exist.
 */

import { actOnQuote, quoteActionSchema } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-QUOTE-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: quoteActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Quote request id is required.');
    return actOnQuote(principal, params.id, body, { requestId });
  },
});
