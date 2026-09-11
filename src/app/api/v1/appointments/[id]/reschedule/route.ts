/**
 * TL-API-APPT-RESCHEDULE-001 — POST /api/v1/appointments/:id/reschedule { startsAt, reason? }
 *
 * Atomic: the new slot is validated and taken, and the old one released, in
 * one transaction under the booking locks and the overlap constraint.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { rescheduleAppointment, rescheduleSchema } from '@/platform/appointments/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPT-RESCHEDULE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: rescheduleSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Appointment id is required.');
    const updated = await rescheduleAppointment(principal, params.id, body, { requestId });
    return jsonSafe({ appointmentId: updated.id, status: updated.status, startsAt: updated.startsAt, endsAt: updated.endsAt });
  },
});
