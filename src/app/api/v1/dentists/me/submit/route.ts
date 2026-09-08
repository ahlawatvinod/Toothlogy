/**
 * TL-API-DENTIST-SUBMIT-001 — POST /api/v1/dentists/me/submit
 *
 * Submits the caller's profile for verification.
 *
 * Completeness is checked BEFORE a reviewer sees it, and the error names
 * exactly what is missing. Sending an incomplete profile to review costs the
 * reviewer's time and returns a rejection the dentist could have avoided.
 */

import { submitForVerification } from '@/platform/dentists/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DENTIST-SUBMIT-001',
  permissions: ['tl.dentist.profile.manage.self'],
  authRequired: true,
  // `costly`: each submission creates review work for a human.
  rateLimit: 'costly',
  audit: true,
  handler: async ({ principal, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await submitForVerification(principal.userId, { requestId });

    return {
      verificationRequestId: result.verificationRequestId,
      status: 'PENDING',
      message:
        'Your profile has been submitted for verification. You will appear in patient search once your dental council registration has been confirmed and a clinic has confirmed where you practise.',
    };
  },
});
