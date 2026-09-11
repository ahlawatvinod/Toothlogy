/**
 * TL-API-WAITLIST-LEAVE-001 — DELETE /api/v1/waitlist/:id
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { leaveWaitlist } from '@/platform/appointments/waitlist';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  id: 'TL-API-WAITLIST-LEAVE-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Entry id is required.');
    const entry = await leaveWaitlist(principal, params.id);
    return { entryId: entry.id, status: entry.status };
  },
});
