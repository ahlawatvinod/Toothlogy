/**
 * TL-API-ENQUIRY-LIST-001 — GET /api/v1/organizations/:id/enquiries?status=&courseId=
 *
 * A college's admission enquiries with the students' details (shared with
 * their consent) and the numbers by status and course.
 */

import type { AdmissionEnquiryStatus } from '@prisma/client';
import { enquiryStats, listEnquiries } from '@/platform/education/enquiries';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const STATUSES = ['NEW', 'CONTACTED', 'APPLIED', 'ADMITTED', 'NOT_ADMITTED', 'WITHDRAWN', 'LOST'];

export const GET = defineRoute({
  id: 'TL-API-ENQUIRY-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const status = url.searchParams.get('status');
    const [enquiries, stats] = await Promise.all([
      listEnquiries(principal, params.id, { status: status && STATUSES.includes(status) ? (status as AdmissionEnquiryStatus) : undefined, courseId: url.searchParams.get('courseId') ?? undefined }),
      enquiryStats(principal, params.id),
    ]);
    return { enquiries, stats };
  },
});
