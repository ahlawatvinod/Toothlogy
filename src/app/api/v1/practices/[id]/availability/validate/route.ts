/**
 * TL-API-AVAIL-VALIDATE-001 — POST /api/v1/practices/:id/availability/validate
 *
 * Is this exact start still bookable? Answered from the same engine the
 * booking transaction uses; a "yes" here is advice, the booking itself is the
 * guarantee.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { db } from '@/platform/db/client';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AVAIL-VALIDATE-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  bodySchema: z.object({
    startsAt: z.string().datetime({ offset: true }),
    type: z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT']).default('CLINIC'),
    serviceOfferingId: z.string().max(64).nullable().optional(),
    emergency: z.boolean().default(false),
  }),
  audit: false,
  handler: async ({ params, body }) => {
    if (typeof params.id !== 'string') throw errors.validation('Practice id is required.');
    const practice = await db().dentistPractice.findUnique({ where: { id: params.id }, select: { location: { select: { timezone: true } } } });
    if (!practice) throw errors.notFound('Practice');
    const startsAt = new Date(body.startsAt);
    const date = localDateOf(startsAt, practice.location.timezone);
    const { slots, reason } = await availableSlots({
      practiceId: params.id,
      fromDate: date,
      toDate: date,
      type: body.type,
      serviceOfferingId: body.serviceOfferingId,
      emergency: body.emergency,
    });
    const bookable = slots.some((s) => s.startsAt === startsAt.toISOString());
    return { bookable, reason: bookable ? null : (reason ?? 'That time is not available.') };
  },
});
