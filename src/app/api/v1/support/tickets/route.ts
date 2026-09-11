/**
 * TL-API-TICKET-OPEN-001 — POST /api/v1/support/tickets { category, subject, body, organizationId? }
 *
 * Ask Toothlogy for help. 5 new tickets a day per person.
 */

import { openTicket, ticketSchema } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TICKET-OPEN-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: ticketSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => openTicket(principal, body, { requestId }),
});
