/**
 * TL-API-TICKET-GET-001 — GET /api/v1/support/tickets/:id
 *
 * One ticket: the requester sees it without staff-only notes; support staff
 * see everything. Anyone else is told it does not exist.
 */

import { getTicket } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-TICKET-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Ticket id is required.');
    return getTicket(principal, params.id);
  },
});
