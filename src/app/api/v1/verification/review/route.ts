/**
 * TL-API-VERIFY-REVIEW-001 — POST /api/v1/verification/review
 *
 * Approve or reject a verification request. Staff only.
 *
 * The self-review check lives in the service, not here, and that placement is
 * deliberate: it must hold for every caller — an admin console, a script, a
 * future bulk-review tool — not only for requests that arrive through this
 * route.
 */

import { reviewDecisionSchema, reviewVerification } from '@/platform/verification/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-VERIFY-REVIEW-001',
  permissions: ['tl.verification.request.review'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: reviewDecisionSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await reviewVerification(body, principal.userId, { requestId });

    return {
      status: result.status,
      expiresAt: result.expiresAt,
      ...(result.status === 'APPROVED'
        ? {
            note: 'The dentist appears in patient search only once a clinic has also confirmed where they practise.',
          }
        : {}),
    };
  },
});
