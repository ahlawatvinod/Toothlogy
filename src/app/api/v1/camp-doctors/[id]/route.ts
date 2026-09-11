/**
 * TL-API-CAMP-DOCTOR-ACTION-001 — POST /api/v1/camp-doctors/:id { action: APPROVE | DECLINE | WITHDRAW | ATTENDED | ABSENT, note? }
 *
 * The organizer decides an application and records attendance; the dentist
 * withdraws before the camp starts.
 */

import { actOnCampDoctor, doctorActionSchema } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-DOCTOR-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: doctorActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Application id is required.');
    await actOnCampDoctor(principal, params.id, body, { requestId });
    return { campDoctorId: params.id, action: body.action };
  },
});
