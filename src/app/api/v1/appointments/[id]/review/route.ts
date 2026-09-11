/**
 * TL-API-REVIEW-WRITE-001 — POST /api/v1/appointments/:id/review { rating, body? }
 *
 * The patient reviews a completed visit, once, within 90 days. Anyone else
 * is told the appointment does not exist.
 */

import { reviewSchema, writeReview } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-REVIEW-WRITE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: reviewSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Appointment id is required.');
    return writeReview(principal, params.id, body, { requestId });
  },
});
