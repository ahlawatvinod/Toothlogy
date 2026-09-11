/**
 * TL-API-BILLING-REVERSE-001 — POST /api/v1/admin/billing/reversals { entryId, reason }
 *
 * Reverse a mistaken credit or adjustment, once. Refused if the money has
 * already been spent.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { reverseEntry } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-BILLING-REVERSE-001',
  permissions: ['tl.billing.ledger.adjust'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: z.object({ entryId: z.string().min(1).max(64), reason: z.string().trim().min(5).max(300) }),
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    const entry = await reverseEntry(principal, body.entryId, body.reason, requestId);
    return jsonSafe({ entryId: entry.id, balanceAfterMinor: entry.balanceAfterMinor });
  },
});
