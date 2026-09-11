/**
 * TL-API-WAITLIST-LIST-001 — GET  /api/v1/waitlist
 * TL-API-WAITLIST-JOIN-001 — POST /api/v1/waitlist
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { jsonSafe } from '@/platform/http/serialize';
import { joinWaitlist, joinWaitlistSchema, listWaitlist } from '@/platform/appointments/waitlist';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-WAITLIST-LIST-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return jsonSafe({ entries: await listWaitlist(principal.userId) });
  },
});

export const POST = defineRoute({
  id: 'TL-API-WAITLIST-JOIN-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: joinWaitlistSchema,
  audit: true,
  handler: async ({ principal, body }) => {
    const entry = await joinWaitlist(principal, body);
    return jsonSafe({ entryId: entry.id, status: entry.status });
  },
});
