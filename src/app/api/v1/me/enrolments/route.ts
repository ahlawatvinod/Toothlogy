/**
 * TL-API-MY-ENROLMENTS-001 — GET /api/v1/me/enrolments
 *
 * The student's own enrolments.
 */

import { defineRoute } from '@/platform/http/handler';
import { myEnrolments } from '@/platform/education/enrolments';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-ENROLMENTS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => myEnrolments(principal),
});
