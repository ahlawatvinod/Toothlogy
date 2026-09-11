/**
 * TL-API-MY-QUOTES-001 — GET /api/v1/me/quotes
 *
 * The signed-in buyer's quote requests and the quotes received.
 */

import { myQuoteRequests } from '@/platform/marketplace/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-QUOTES-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe({ quotes: await myQuoteRequests(principal) }),
});
