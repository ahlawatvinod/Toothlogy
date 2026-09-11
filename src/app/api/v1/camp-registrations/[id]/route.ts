/**
 * TL-API-CAMP-REGISTRATION-ACTION-001 — POST /api/v1/camp-registrations/:id
 *   { op: CANCEL } — the patient, before the camp
 *   | { op: VISIT, findings?, needsFollowUp, referredDentistProfileId? } — the organizer or a camp doctor
 */

import { z } from 'zod';
import { cancelRegistration, recordVisit } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ op: z.enum(['CANCEL', 'VISIT']) }).passthrough();

export const POST = defineRoute({
  id: 'TL-API-CAMP-REGISTRATION-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Registration id is required.');
    const { op, ...rest } = body;
    if (op === 'CANCEL') await cancelRegistration(principal, params.id, { requestId });
    else await recordVisit(principal, params.id, rest as never, { requestId });
    return { registrationId: params.id, op };
  },
});
