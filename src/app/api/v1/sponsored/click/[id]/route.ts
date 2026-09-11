/**
 * TL-API-SPONSORED-CLICK-001 — GET /api/v1/sponsored/click/:impressionId
 *
 * The link behind every Sponsored result. Records the click — once per
 * impression, and as excluded when it comes from the promoted organization's
 * own people — then redirects to the profile. Clicks are never charged, so
 * repeating one gains nothing.
 */

import { recordSponsoredClick } from '@/platform/sponsored/serve';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-SPONSORED-CLICK-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ principal, params, url }) => {
    const id = typeof params.id === 'string' ? params.id : '';
    const { location } = await recordSponsoredClick(id, isAuthenticated(principal) ? principal.userId : null);
    return new Response(null, { status: 303, headers: { Location: new URL(location, url.origin).toString(), 'Cache-Control': 'no-store' } });
  },
});
