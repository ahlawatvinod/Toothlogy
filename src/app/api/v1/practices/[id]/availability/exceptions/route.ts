/**
 * TL-API-AVAIL-EXCEPTION-ADD-001    — POST   /api/v1/practices/:id/availability/exceptions
 * TL-API-AVAIL-EXCEPTION-REMOVE-001 — DELETE /api/v1/practices/:id/availability/exceptions?exceptionId=
 *
 * Leave and blocked time. A block over a booked appointment is refused.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { addAvailabilityException, exceptionSchema, removeAvailabilityException } from '@/platform/appointments/availability-admin';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AVAIL-EXCEPTION-ADD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: exceptionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const created = await addAvailabilityException(principal, params.id, body, requestId);
    return { id: created.id };
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-AVAIL-EXCEPTION-REMOVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const exceptionId = url.searchParams.get('exceptionId');
    if (!exceptionId) throw errors.validation('Say which exception to remove.', { field: 'exceptionId' });
    await removeAvailabilityException(principal, params.id, exceptionId);
    return { removed: true };
  },
});
