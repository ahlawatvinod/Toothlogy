/**
 * TL-API-MY-TICKETS-001 — GET /api/v1/me/tickets
 *
 * The signed-in person's support tickets.
 */

import { myTickets } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-TICKETS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ tickets: await myTickets(principal) }),
});
