/**
 * TL-API-REVIEW-RESPOND-001 — POST /api/v1/reviews/:id/response { body }
 *
 * The practice's one public reply (editable). Checks tl.reviews.review.respond
 * on the reviewed practice, or that the caller is the treating dentist.
 */

import { respondToReview, responseSchema } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-REVIEW-RESPOND-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: responseSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Review id is required.');
    await respondToReview(principal, params.id, body, { requestId });
    return { reviewId: params.id };
  },
});
