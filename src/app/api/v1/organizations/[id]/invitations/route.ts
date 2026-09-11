/**
 * TL-API-ORG-INVITE-001    — POST /api/v1/organizations/:id/invitations
 * TL-API-ORG-INVITELIST-001 — GET /api/v1/organizations/:id/invitations
 *
 * Inviting requires `tl.core.organization.manage`, scoped to this organization.
 * Listing requires only `read`: staff should be able to see who is pending
 * without being able to add people.
 *
 * The invitation is emailed to the invited address whether or not an account
 * exists for it. The link travels as transient data, never stored.
 */

import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { inviteSchema, inviteToOrganization, listInvitations } from '@/platform/organizations/service';
import { absoluteUrl, sendToAddress } from '@/platform/notifications';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const POST = defineRoute({
  id: 'TL-API-ORG-INVITE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: inviteSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId, logger }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');

    const invitation = await inviteToOrganization(organizationId, body, principal.userId, {
      requestId,
    });

    const [organization, inviter] = await Promise.all([
      db().organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
      db().user.findUnique({ where: { id: principal.userId }, select: { displayName: true } }),
    ]);

    const outcome = await sendToAddress({
      notificationId: 'TL-NOTIF-ORG-INVITATION-001',
      email: body.email,
      data: {
        organization: organization?.name ?? 'an organization',
        inviter: inviter?.displayName ?? 'A colleague',
        role: body.roleKey.replace(/_/g, ' '),
      },
      transientData: {
        inviteUrl: absoluteUrl(`/invitations/accept?token=${encodeURIComponent(invitation.token)}`),
      },
    });

    if (!outcome.anyDelivered) {
      logger.warn('Invitation could not be delivered', {
        organizationId,
        outcomes: outcome.outcomes.map((o) => `${o.channel}:${o.status}:${o.reason ?? ''}`),
      });
    }

    return {
      invitationId: invitation.invitationId,
      expiresAt: invitation.expiresAt,
      /**
       * The real outcome. `false` means no email provider is configured — the
       * administrator must share the link another way, and telling them
       * "invitation sent" would be a lie (Constitution P10).
       */
      delivered: outcome.anyDelivered,
      deliveryFailureReason: outcome.anyDelivered ? null : (outcome.outcomes[0]?.reason ?? null),
      /**
       * Returned ONLY to the administrator who created it, over an authorized
       * channel, so an invitation can still be shared while email is
       * unconfigured. It is never logged and never returned by the list
       * endpoint.
       */
      inviteToken: invitation.token,
    };
  },
});

export const GET = defineRoute({
  id: 'TL-API-ORG-INVITELIST-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');
    return { invitations: await listInvitations(organizationId) };
  },
});
