/**
 * TL-API-FACULTY-DECISION-001 — POST /api/v1/faculty-appointments/:id { decision: CONFIRM | DECLINE | END }
 *
 * The college confirms or declines a request, or ends a post; the faculty
 * member may end their own. Anyone else is told it does not exist.
 */

import { appointmentDecisionSchema, decideFacultyAppointment } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-FACULTY-DECISION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: appointmentDecisionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Appointment id is required.');
    return decideFacultyAppointment(principal, params.id, body, { requestId });
  },
});
