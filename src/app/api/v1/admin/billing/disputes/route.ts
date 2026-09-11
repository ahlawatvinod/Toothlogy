/**
 * TL-API-BILLING-DISPUTES-001 — GET /api/v1/admin/billing/disputes
 *
 * Open lead-charge disputes, oldest first, for staff to decide.
 */

import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { db } from '@/platform/db/client';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-BILLING-DISPUTES-001',
  permissions: ['tl.billing.dispute.resolve'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async () => {
    const disputes = await db().leadDispute.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: {
        lead: {
          select: { id: true, source: true, status: true, priceMinor: true, taxMinor: true, currency: true, organization: { select: { name: true } } },
        },
      },
      take: 100,
    });
    return jsonSafe({ disputes });
  },
});
