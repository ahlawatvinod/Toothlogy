/**
 * TL-API-PRACTICE-DIARY-001 — GET /api/v1/practice/appointments?from=&to=&organizationId=&status=
 *
 * The practice diary: the caller's own appointments as a dentist, plus those
 * of every organization where they may manage appointments.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { listPracticeAppointments } from '@/platform/appointments/service';

export const dynamic = 'force-dynamic';

const query = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  organizationId: z.string().max(64).optional(),
  status: z.string().max(200).optional(),
});

export const GET = defineRoute({
  id: 'TL-API-PRACTICE-DIARY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    const parsed = query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw errors.validation('Provide from and to as ISO date-times.');
    const from = new Date(parsed.data.from);
    const to = new Date(parsed.data.to);
    if (to.getTime() - from.getTime() > 62 * 86_400_000) throw errors.validation('Ask for at most 62 days at a time.');
    const appointments = await listPracticeAppointments(principal, {
      from,
      to,
      organizationId: parsed.data.organizationId,
      statuses: parsed.data.status ? parsed.data.status.split(',') : undefined,
    });
    return jsonSafe({ appointments });
  },
});
