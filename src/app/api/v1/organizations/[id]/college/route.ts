/**
 * TL-API-COLLEGE-PROFILE-001 — PATCH /api/v1/organizations/:id/college
 *
 * A college's ownership, affiliation, stated recognition and admissions
 * contact. Changing the stated recognition clears a previous staff check.
 */

import { collegeProfileSchema, upsertCollegeProfile } from '@/platform/education/colleges';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-COLLEGE-PROFILE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: collegeProfileSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const profile = await upsertCollegeProfile(principal, params.id, body, { requestId });
    return { organizationId: profile.organizationId, recognitionVerified: profile.recognitionVerifiedAt !== null };
  },
});
