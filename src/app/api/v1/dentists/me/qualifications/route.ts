/**
 * TL-API-DENTIST-QUAL-001 — POST /api/v1/dentists/me/qualifications
 *
 * Adds a qualification to the caller's own profile.
 *
 * The response reports `verificationCleared` honestly. Adding a credential to
 * a verified profile drops it back to review — because the new qualification
 * has not been checked — and the dentist needs to know that immediately rather
 * than discovering days later that they left patient search.
 */

import { addQualification, qualificationSchema } from '@/platform/dentists/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DENTIST-QUAL-001',
  permissions: ['tl.dentist.profile.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: qualificationSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await addQualification(principal.userId, body, { requestId });

    return {
      qualificationId: result.qualificationId,
      verificationCleared: result.verificationCleared,
      ...(result.verificationCleared
        ? {
            warning:
              'Adding a qualification returned your profile to review, because the new credential has not been verified. You are temporarily not appearing in patient search.',
          }
        : {}),
    };
  },
});
