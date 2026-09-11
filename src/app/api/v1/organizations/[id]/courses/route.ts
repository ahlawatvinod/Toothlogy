/**
 * TL-API-COURSE-LIST-001   — GET  /api/v1/organizations/:id/courses
 * TL-API-COURSE-CREATE-001 — POST /api/v1/organizations/:id/courses
 *
 * A college's profile, courses and admission windows; adding a course (a
 * draft until published). Only for the college's administrators; anyone
 * else is told it does not exist.
 */

import { collegeConsole, courseSchema, createCourse } from '@/platform/education/colleges';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-COURSE-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await collegeConsole(principal, params.id));
  },
});

export const POST = defineRoute({
  id: 'TL-API-COURSE-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: courseSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return createCourse(principal, params.id, body, { requestId });
  },
});
