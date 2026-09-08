/**
 * TL-API-DENTIST-PRACTICE-001 — POST /api/v1/dentists/me/practices
 *
 * A dentist claims that they practise at a clinic location.
 *
 * The claim starts UNCONFIRMED and confers nothing. The clinic must confirm it
 * separately — otherwise any dentist could claim to work at any clinic, appear
 * in that clinic's results, and take its patients. The claim is a request, not
 * an assertion.
 */

import { z } from 'zod';
import { claimPractice } from '@/platform/dentists/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  locationId: z.string().min(1, 'Choose a clinic location.'),
});

export const POST = defineRoute({
  id: 'TL-API-DENTIST-PRACTICE-001',
  permissions: ['tl.dentist.profile.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await claimPractice(principal.userId, body.locationId, { requestId });

    return {
      practiceId: result.practiceId,
      isConfirmed: result.isConfirmed,
      message:
        'Your claim has been recorded. The clinic must confirm it before you appear in patient search for this location.',
    };
  },
});
