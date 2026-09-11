/**
 * TL-API-COLLEGE-FACULTY-001 — GET /api/v1/organizations/:id/faculty
 *
 * A college's faculty requests and posts, for its administrators. Checks
 * tl.education.faculty.confirm on the college.
 */

import { collegeFaculty } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-COLLEGE-FACULTY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return { appointments: await collegeFaculty(principal, params.id) };
  },
});
