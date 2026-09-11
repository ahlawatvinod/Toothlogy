/**
 * TL-API-MY-REVIEWS-001 — GET /api/v1/me/reviews
 *
 * The signed-in patient's reviews and the practices' replies.
 */

import { myReviews } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-REVIEWS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ reviews: await myReviews(principal) }),
});
