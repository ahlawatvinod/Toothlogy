/**
 * TL-API-CAMPAIGN-ADMIN-LIST-001 — GET /api/v1/admin/campaigns?status=ACTIVE
 *
 * Every organization's sponsored campaigns, for Toothlogy staff.
 */

import { listAllCampaigns } from '@/platform/sponsored/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-CAMPAIGN-ADMIN-LIST-001',
  permissions: ['tl.advertising.campaign.administer'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => jsonSafe({ campaigns: await listAllCampaigns(principal, { status: url.searchParams.get('status') ?? undefined }) }),
});
