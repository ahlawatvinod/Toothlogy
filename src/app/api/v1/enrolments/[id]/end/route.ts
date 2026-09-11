/**
 * TL-API-ENROLMENT-END-001 — POST /api/v1/enrolments/:id/end { status: COMPLETED | WITHDRAWN, endedOn, reason? }
 *
 * The college marks an enrolment completed or withdrawn (a withdrawal needs a
 * reason). The student is told. Never deleted.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { endEnrolment, endSchema } from '@/platform/education/enrolments';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENROLMENT-END-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: endSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Enrolment id is required.');
    return endEnrolment(principal, params.id, body, { requestId });
  },
});
