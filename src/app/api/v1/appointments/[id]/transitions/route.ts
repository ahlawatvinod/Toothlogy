/**
 * TL-API-APPT-TRANSITION-001 — POST /api/v1/appointments/:id/transitions { action, reason?, … }
 *
 * The one way to change an appointment's status. The state machine decides
 * whether this actor may take this action from the current state.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { transition, transitionSchema } from '@/platform/appointments/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPT-TRANSITION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: transitionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Appointment id is required.');
    const { action, ...rest } = body;
    const updated = await transition(principal, params.id, action, rest, { requestId });
    return jsonSafe({ appointmentId: updated.id, status: updated.status });
  },
});
