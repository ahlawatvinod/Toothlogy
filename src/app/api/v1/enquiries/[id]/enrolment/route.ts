/**
 * TL-API-ENROLMENT-CREATE-001 — POST /api/v1/enquiries/:id/enrolment { academicYear, rollNumber?, startedOn }
 *
 * A college enrols a student it admitted (tl.education.enrolment.manage).
 * The student is told.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { enrolFromEnquiry, enrolSchema } from '@/platform/education/enrolments';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENROLMENT-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: enrolSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Enquiry id is required.');
    return enrolFromEnquiry(principal, params.id, body, { requestId });
  },
});
