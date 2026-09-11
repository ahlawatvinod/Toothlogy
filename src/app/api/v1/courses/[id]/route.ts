/**
 * TL-API-COURSE-UPDATE-001 — PATCH /api/v1/courses/:id
 *
 * Edit, publish or archive a course. Only the college's administrators.
 */

import { courseUpdateSchema, updateCourse } from '@/platform/education/colleges';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-COURSE-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: courseUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Course id is required.');
    const course = await updateCourse(principal, params.id, body, { requestId });
    return { courseId: course.id, status: course.status };
  },
});
