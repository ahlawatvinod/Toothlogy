/**
 * TL-API-CAMPAIGN-GET-001    — GET   /api/v1/campaigns/:id
 * TL-API-CAMPAIGN-UPDATE-001 — PATCH /api/v1/campaigns/:id
 *
 * One campaign with its sponsored analytics, spend and audit trail; editing
 * it. The service answers "not found" to anyone outside the organization who
 * is not Toothlogy staff.
 */

import { campaignUpdateSchema, getCampaign, updateCampaign } from '@/platform/sponsored/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CAMPAIGN-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Campaign id is required.');
    return jsonSafe(await getCampaign(principal, params.id));
  },
});

export const PATCH = defineRoute({
  id: 'TL-API-CAMPAIGN-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campaignUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Campaign id is required.');
    return jsonSafe({ campaign: await updateCampaign(principal, params.id, body, { requestId }) });
  },
});
