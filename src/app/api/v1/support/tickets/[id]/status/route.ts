/**
 * TL-API-TICKET-STATUS-001 — POST /api/v1/support/tickets/:id/status { status: OPEN | RESOLVED | CLOSED }
 *
 * Support staff resolve, close or reopen; the requester may close their own.
 */

import { setTicketStatus, statusSchema } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TICKET-STATUS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: statusSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Ticket id is required.');
    await setTicketStatus(principal, params.id, body, { requestId });
    return { status: body.status };
  },
});
