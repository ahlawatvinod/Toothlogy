/**
 * TL-API-QUOTE-LIST-001 — GET /api/v1/organizations/:id/quotes?status=
 *
 * A business's quote requests with the buyers' details and the numbers.
 * Checks tl.marketplace.quote.read on the business.
 */

import type { QuoteStatus } from '@prisma/client';
import { listSellerQuotes, sellerQuoteStats } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const STATUSES = ['NEW', 'QUOTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED', 'CLOSED'];

export const GET = defineRoute({
  id: 'TL-API-QUOTE-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const status = url.searchParams.get('status');
    const [quotes, stats] = await Promise.all([
      listSellerQuotes(principal, params.id, { status: status && STATUSES.includes(status) ? (status as QuoteStatus) : undefined }),
      sellerQuoteStats(principal, params.id),
    ]);
    return jsonSafe({ quotes, stats });
  },
});
