/**
 * TL-API-AVAIL-CONFIG-GET-001 — GET /api/v1/practices/:id/availability/rules
 * TL-API-AVAIL-CONFIG-SET-001 — PUT /api/v1/practices/:id/availability/rules
 *
 * The dentist's weekly sessions at one practice, with upcoming leave and
 * blocks. The dentist or clinic staff with `tl.appointment.availability.manage`; anyone
 * else is told the practice does not exist.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { listAvailability, rulesSchema, setAvailabilityRules } from '@/platform/appointments/availability-admin';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-AVAIL-CONFIG-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    return listAvailability(principal, params.id);
  },
});

export const PUT = defineRoute({
  id: 'TL-API-AVAIL-CONFIG-SET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: rulesSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    return setAvailabilityRules(principal, params.id, body, requestId);
  },
});
