/**
 * TL-API-REVIEW-EDIT-001   — PATCH  /api/v1/reviews/:id { rating, body? }  (the patient, within 30 days)
 * TL-API-REVIEW-REMOVE-001 — DELETE /api/v1/reviews/:id                  (the patient; text cleared)
 */

import { editReview, removeReview, reviewSchema } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-REVIEW-EDIT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: reviewSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Review id is required.');
    await editReview(principal, params.id, body, { requestId });
    return { reviewId: params.id };
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-REVIEW-REMOVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Review id is required.');
    await removeReview(principal, params.id, { requestId });
    return { removed: true };
  },
});
