/**
 * TL-API-REVIEW-MODERATE-001 — POST /api/v1/admin/reviews/:id/moderate { action: HIDE | RESTORE | KEEP, reason? }
 *
 * Moderators hide a review with the reason the patient is told, restore it,
 * or keep it (clearing the practice's flag).
 */

import { moderateReview, moderateSchema } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-REVIEW-MODERATE-001',
  permissions: ['tl.reviews.review.moderate'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: moderateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Review id is required.');
    await moderateReview(principal, params.id, body, { requestId });
    return { action: body.action };
  },
});
