/**
 * TL-API-AVAIL-DATES-001 — GET /api/v1/practices/:id/availability/dates?from=&to=&type=&serviceOfferingId=
 *
 * Local dates with at least one bookable slot, straight from the database.
 * Public: a patient chooses a date before signing in.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { availableDates } from '@/platform/appointments/availability';

export const dynamic = 'force-dynamic';

const query = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT']).default('CLINIC'),
  serviceOfferingId: z.string().max(64).optional(),
  emergency: z.enum(['1', '0']).optional(),
});

export const GET = defineRoute({
  id: 'TL-API-AVAIL-DATES-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const parsed = query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw errors.validation('Provide from and to dates like 2026-10-02.');
    return availableDates({
      practiceId: params.id,
      fromDate: parsed.data.from,
      toDate: parsed.data.to,
      type: parsed.data.type,
      serviceOfferingId: parsed.data.serviceOfferingId,
      emergency: parsed.data.emergency === '1',
    });
  },
});
