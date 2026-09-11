/**
 * TL-API-CAMPAIGN-ACTION-001 — POST /api/v1/campaigns/:id/actions { action: ACTIVATE | PAUSE | RESUME | CANCEL }
 *
 * Activating holds the budget from the wallet (refused if the wallet cannot
 * cover it); cancelling refunds what was not spent. Declared idempotent: a
 * replayed request with the same Idempotency-Key returns the first answer.
 */

import { actOnCampaign, campaignActionSchema } from '@/platform/sponsored/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMPAIGN-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campaignActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Campaign id is required.');
    return jsonSafe({ campaign: await actOnCampaign(principal, params.id, body, { requestId }) });
  },
});
