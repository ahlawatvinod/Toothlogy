/**
 * TL-API-INVITE-ACCEPT-001 — POST /api/v1/invitations/accept
 *
 * Accepts an organization invitation.
 *
 * Not scoped to an organization: the caller is not a member yet, so no
 * organization permission could possibly pass. The invitation TOKEN is the
 * authorization, and the service additionally requires the accepting account's
 * email to match the invited address — without that, anyone holding a forwarded
 * token could join an organization they were never invited to.
 */

import { z } from 'zod';
import { acceptInvitation } from '@/platform/organizations/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(1, 'The invitation link is missing its token.'),
});

export const POST = defineRoute({
  id: 'TL-API-INVITE-ACCEPT-001',
  permissions: [],
  // Authentication IS required: joining an organization has to attach to an
  // account, so the invitee signs in or registers first.
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await acceptInvitation(body.token, principal.userId, { requestId });

    return {
      joined: true,
      organizationId: result.organizationId,
      roleKey: result.roleKey,
    };
  },
});
