/**
 * TL-API-TICKET-ASSIGN-001 — POST /api/v1/admin/support/tickets/:id/assign { assignedToUserId | null }
 *
 * Give a ticket to someone on the support team, or back to the queue.
 */

import { assignSchema, assignTicket } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TICKET-ASSIGN-001',
  permissions: ['tl.support.ticket.work'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: assignSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Ticket id is required.');
    await assignTicket(principal, params.id, body, { requestId });
    return { assignedToUserId: body.assignedToUserId };
  },
});
