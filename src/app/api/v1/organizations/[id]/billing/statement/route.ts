/**
 * TL-API-BILLING-STATEMENT-001 — GET /api/v1/organizations/:id/billing/statement?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * A statement of account for any date range: opening and closing balance,
 * credits, lead charges, refunds, reversals, GST on leads and lead counts
 * (free, paid, waiting). It says, in the response itself, that it is not a
 * GST tax invoice.
 */

import { accountStatement } from '@/platform/billing/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-BILLING-STATEMENT-001',
  permissions: ['tl.billing.wallet.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  audit: false,
  handler: async ({ principal, params, url }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    return jsonSafe(await accountStatement(principal, params.id, from, to));
  },
});
