/**
 * TL-API-BILLING-OVERVIEW-001 — GET /api/v1/organizations/:id/billing
 *
 * Wallet balance, ledger, invoices, disputes, this month's lead charges and
 * the current lead price. Money is returned as minor-unit strings.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { jsonSafe } from '@/platform/http/serialize';
import { walletOverview } from '@/platform/billing/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-BILLING-OVERVIEW-001',
  permissions: ['tl.billing.wallet.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({ organizationId: typeof params.id === 'string' ? params.id : undefined }),
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await walletOverview(principal, params.id));
  },
});
