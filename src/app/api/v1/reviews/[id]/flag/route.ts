/**
 * TL-API-REVIEW-FLAG-001 — POST /api/v1/reviews/:id/flag { reason }
 *
 * The practice asks a moderator to look at a review. It stays published
 * until a moderator decides.
 */

import { flagReview, flagSchema } from '@/platform/reviews/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-REVIEW-FLAG-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: flagSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Review id is required.');
    await flagReview(principal, params.id, body, { requestId });
    return { flagged: true };
  },
});
