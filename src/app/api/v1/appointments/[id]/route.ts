/**
 * TL-API-APPT-GET-001 — GET /api/v1/appointments/:id
 *
 * For its patient and its practice only; to anyone else it does not exist.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { getAppointment } from '@/platform/appointments/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-APPT-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Appointment id is required.');
    const { appointment, actor } = await getAppointment(principal, params.id);
    return jsonSafe({ appointment, viewerRole: actor });
  },
});
