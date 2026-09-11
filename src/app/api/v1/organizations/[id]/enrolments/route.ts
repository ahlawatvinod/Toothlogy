/**
 * TL-API-ENROLMENTS-LIST-001 — GET /api/v1/organizations/:id/enrolments?courseId=&academicYear=&status=
 *
 * A college's roll (tl.education.enrolment.manage on it).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { collegeRoll } from '@/platform/education/enrolments';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ENROLMENTS-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ request, principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const p = new URL(request.url).searchParams;
    return collegeRoll(principal, params.id, { courseId: p.get('courseId') || undefined, academicYear: p.get('academicYear') || undefined, status: (p.get('status') || undefined) as never });
  },
});
