/**
 * TL-API-ORG-CLAIM-001 — POST /api/v1/organizations/:id/claim
 *
 * Claim an unowned clinic listing, with documents. No organization permission
 * is required — by definition the claimant is not a member yet — but the
 * claim confers nothing until a reviewer approves it.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { claimOrganization, claimSchema } from '@/platform/organizations/claim';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORG-CLAIM-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: claimSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    const result = await claimOrganization(params.id, principal.userId, body, { requestId });
    return {
      ...result,
      message: 'Your claim has been submitted. A Toothlogy reviewer will check your documents before you can manage this clinic.',
    };
  },
});
