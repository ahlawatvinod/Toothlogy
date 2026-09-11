/**
 * TL-API-ORG-OWNER-001 — POST /api/v1/organizations/:id/ownership  { newOwnerUserId }
 *
 * Transfer ownership to another member. Requires organization management AND
 * being the current owner — an administrator who is not the owner is refused
 * by the service, so ownership cannot be taken, only given.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { transferOwnership } from '@/platform/organizations/management';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORG-OWNER-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema: z.object({ newOwnerUserId: z.string().min(1).max(64) }),
  resolveScope: ({ params }) => ({
    organizationId: typeof params.id === 'string' ? params.id : undefined,
  }),
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal) || typeof params.id !== 'string') throw errors.unauthenticated();
    await transferOwnership(params.id, principal.userId, body.newOwnerUserId, { requestId });
    return { transferred: true };
  },
});
