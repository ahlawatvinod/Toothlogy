/**
 * TL-API-CAMPAIGN-LIST-001   — GET  /api/v1/organizations/:id/campaigns
 * TL-API-CAMPAIGN-CREATE-001 — POST /api/v1/organizations/:id/campaigns
 *
 * An organization's Prime (sponsored) campaigns. Creating one makes a DRAFT:
 * nothing is shown and no money moves until it is activated.
 */

import { campaignInputSchema, createCampaign, listCampaigns } from '@/platform/sponsored/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const GET = defineRoute({
  id: 'TL-API-CAMPAIGN-LIST-001',
  permissions: ['tl.advertising.campaign.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe({ campaigns: await listCampaigns(principal, params.id) });
  },
});

export const POST = defineRoute({
  id: 'TL-API-CAMPAIGN-CREATE-001',
  permissions: ['tl.advertising.campaign.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campaignInputSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe({ campaign: await createCampaign(principal, params.id, body, { requestId }) });
  },
});
