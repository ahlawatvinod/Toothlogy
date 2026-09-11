/**
 * TL-API-AVAIL-SLOTS-001 — GET /api/v1/practices/:id/availability/slots?date=&type=&serviceOfferingId=&emergency=
 *
 * Every bookable slot on one local date. Never a past slot, never a
 * hard-coded one: generated from hours, sessions, closures, leave, existing
 * appointments and chairs at the moment of asking.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { availableSlots } from '@/platform/appointments/availability';

export const dynamic = 'force-dynamic';

const query = z.object({
  date: z.string(),
  type: z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT']).default('CLINIC'),
  serviceOfferingId: z.string().max(64).optional(),
  emergency: z.enum(['1', '0']).optional(),
});

export const GET = defineRoute({
  id: 'TL-API-AVAIL-SLOTS-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const parsed = query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw errors.validation('Provide a date like 2026-10-02.');
    return availableSlots({
      practiceId: params.id,
      fromDate: parsed.data.date,
      toDate: parsed.data.date,
      type: parsed.data.type,
      serviceOfferingId: parsed.data.serviceOfferingId,
      emergency: parsed.data.emergency === '1',
    });
  },
});
