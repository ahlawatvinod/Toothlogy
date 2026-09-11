/**
 * TL-API-SUPPORT-QUEUE-001 — GET /api/v1/admin/support/tickets?status=&mine=1
 *
 * The support queue: open and waiting tickets, oldest activity first.
 */

import type { SupportTicketStatus } from '@prisma/client';
import { supportQueue } from '@/platform/support/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

const STATUSES = ['OPEN', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'];

export const GET = defineRoute({
  id: 'TL-API-SUPPORT-QUEUE-001',
  permissions: ['tl.support.ticket.work'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    const status = url.searchParams.get('status');
    return { tickets: await supportQueue(principal, { status: status && STATUSES.includes(status) ? (status as SupportTicketStatus) : undefined, mine: url.searchParams.get('mine') === '1' }) };
  },
});
