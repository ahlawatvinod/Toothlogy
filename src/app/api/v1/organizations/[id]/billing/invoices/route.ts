/**
 * TL-API-BILLING-INVOICE-001 — POST /api/v1/organizations/:id/billing/invoices { month: "2026-10" }
 *
 * Issue (or fetch) the statement for one calendar month, with tax.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { issueInvoice } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-BILLING-INVOICE-001',
  permissions: ['tl.billing.wallet.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  bodySchema: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10.') }),
  audit: true,
  handler: async ({ params, body }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const [y, m] = body.month.split('-').map(Number) as [number, number];
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    if (start.getTime() > Date.now()) throw errors.validation('That month has not started.');
    return jsonSafe({ invoice: await issueInvoice(params.id, start, end) });
  },
});
