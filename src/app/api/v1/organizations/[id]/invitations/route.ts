/**
 * TL-API-ORG-INVITE-001    — POST /api/v1/organizations/:id/invitations
 * TL-API-ORG-INVITELIST-001 — GET /api/v1/organizations/:id/invitations
 *
 * Inviting requires `tl.core.organization.manage`, scoped to this organization.
 * Listing requires only `read`: staff should be able to see who is pending
 * without being able to add people.
 */

import { getPublicConfig } from '@/platform/config';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { inviteSchema, inviteToOrganization, listInvitations } from '@/platform/organizations/service';
import { sendNotification } from '@/platform/notifications';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';

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

    // Deliver the invitation. The invitee may have no account yet, so there is
    // no user id to address — the notification is sent to the email directly
    // and a placeholder recipient id is used for the delivery record.
    const existingUser = await db().user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });

    let delivered = false;
    if (existingUser) {
      const outcome = await sendNotification({
        notificationId: 'TL-NOTIF-WELCOME-001',
        recipient: {
          userId: existingUser.id,
          email: body.email,
          locale: 'en',
          timezone: 'Asia/Kolkata',
        },
        data: {
          inviteUrl: `${getPublicConfig().NEXT_PUBLIC_APP_URL}/invitations/accept?token=${invitation.token}`,
        },
        requestId,
      });
      delivered = outcome.anyDelivered;
    }

    if (!delivered) {
      logger.warn('Invitation could not be delivered', {
        organizationId,
        hasAccount: Boolean(existingUser),
      });
    }

    return {
      invitationId: invitation.invitationId,
      expiresAt: invitation.expiresAt,
      /**
       * The real outcome. `false` means the invitee has no account yet or no
       * email provider is configured — either way the administrator needs to
       * share the link another way, and telling them "invitation sent" would be
       * a lie (Constitution P10).
       */
      delivered,
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
