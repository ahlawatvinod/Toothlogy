/**
 * TL-API-TICKET-REPLY-001 — POST /api/v1/support/tickets/:id/replies { body, internal? }
 *
 * The requester or support staff add to a ticket; only staff may add an
 * internal note, which the requester never sees.
 */

import { replySchema, replyToTicket } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TICKET-REPLY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: replySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Ticket id is required.');
    await replyToTicket(principal, params.id, body, { requestId });
    return { ticketId: params.id };
  },
});
