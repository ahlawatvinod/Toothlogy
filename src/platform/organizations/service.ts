/**
 * TOOTHLOGY ORGANIZATION SERVICE
 *
 * Organizations, membership, invitations and locations.
 *
 * ONE SHAPE FOR CLINIC, HOSPITAL, COLLEGE, SUPPLIER AND EMPLOYER
 * They differ in what they *do*, not in what they *are*: each is a group of
 * people with roles, addresses and verification state. Modelling them
 * separately would mean five copies of membership, five copies of invitation
 * handling, and five places for an authorization check to be written slightly
 * differently — and the one that differs is the security hole.
 *
 * LOCATIONS ARE SEPARATE FROM THE ORGANIZATION
 * A clinic chain is one organization with many branches. Discovery,
 * availability and booking all attach to the BRANCH, because that is what a
 * patient travels to. One address on the organization would make multi-location
 * practices impossible without a later migration.
 */

import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ROLE_BY_KEY } from '@/registry/roles';
import { COUNTRY_BY_CODE } from '@/registry/globalization';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, isUniqueConstraintError, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

/**
 * Slugs appear in public URLs, so they must be URL-safe, stable and
 * unambiguous. Reserved words are refused to keep routing unambiguous — an
 * organization slugged `api` or `admin` would shadow a platform route.
 */
const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'auth',
  'login',
  'logout',
  'register',
  'settings',
  'search',
  'help',
  'about',
  'contact',
  'terms',
  'privacy',
  'new',
  'edit',
  'me',
  'dashboard',
  'design-system',
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Use at least 3 characters.')
  .max(60, 'Use at most 60 characters.')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and single hyphens only.',
  )
  .refine((value) => !RESERVED_SLUGS.has(value), 'That name is reserved.');

export const ORGANIZATION_TYPES = [
  'CLINIC',
  'HOSPITAL',
  'COLLEGE',
  'SUPPLIER',
  'MANUFACTURER',
  'DISTRIBUTOR',
  'WHOLESALER',
  'RETAILER',
  'LABORATORY',
  'EMPLOYER',
] as const;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Enter the organization name.').max(200),
  slug: slugSchema,
  type: z.enum(ORGANIZATION_TYPES),
  countryCode: z
    .string()
    .length(2)
    .toUpperCase()
    .refine((code) => COUNTRY_BY_CODE.has(code), 'That country is not supported yet.'),
  timezone: z.string().min(1),
  currency: z.string().length(3).toUpperCase().optional(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/** Roles assignable within an organization. */
export const ORGANIZATION_ROLES = [
  'clinic_admin',
  'clinician',
  'clinic_staff',
  'dentist',
  'supplier',
] as const;

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  roleKey: z.enum(ORGANIZATION_ROLES),
});

export type InviteInput = z.infer<typeof inviteSchema>;

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

/**
 * Create an organization and make the creator its administrator.
 *
 * Both writes are in one transaction. An organization with no members is
 * unreachable and unmanageable — nobody can invite anyone into it, so it can
 * only be fixed by a database edit.
 *
 * The organization starts `PENDING`: it exists and can be configured, but is
 * not publicly discoverable until verified (Constitution P2). Discovery must
 * never surface an unverified clinic.
 */
export async function createOrganization(
  rawInput: CreateOrganizationInput,
  ownerUserId: string,
  context: { requestId?: string } = {},
): Promise<{ organizationId: string }> {
  /*
   * Validate here as well as at the API boundary.
   *
   * The route parses the body, but this service is also called from scripts,
   * background jobs, tests and future internal code — none of which pass
   * through a Zod schema. A service that trusts its caller is only as safe as
   * its least careful caller, and a reserved slug like `admin` reaching the
   * database would shadow a platform route.
   */
  const parsed = createOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The organization details are not valid.', {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  const input = parsed.data;

  const country = COUNTRY_BY_CODE.get(input.countryCode);
  if (!country) throw errors.validation('That country is not supported yet.');
  // Modelled is not open: the database switch (set by staff once the country
  // is configured) decides where organizations may be created (Phase 12).
  const open = await db().country.findUnique({ where: { code: input.countryCode }, select: { enabled: true } });
  if (!open?.enabled) throw errors.validation('Toothlogy is not open for organizations in that country yet.', { field: 'countryCode' });

  const organizationId = newId('organization');

  try {
    await transaction(async (tx) => {
      await tx.organization.create({
        data: {
          id: organizationId,
          type: input.type,
          name: input.name,
          slug: input.slug,
          countryCode: input.countryCode,
          timezone: input.timezone,
          currency: input.currency ?? country.defaultCurrency,
          status: 'PENDING',
          ownerUserId,
        },
      });

      await tx.organizationMember.create({
        data: {
          id: newId('organizationMember'),
          userId: ownerUserId,
          organizationId,
          roleKey: 'clinic_admin',
          isPrimary: true,
        },
      });

      // An organization-scoped role assignment as well as the membership row.
      // Membership records *belonging*; the assignment is what the RBAC layer
      // resolves permissions from.
      await tx.roleAssignment.create({
        data: {
          id: newId('request'),
          userId: ownerUserId,
          roleKey: 'clinic_admin',
          organizationId,
          grantedByUserId: ownerUserId,
        },
      });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      // The slug is public and unique platform-wide, so naming the collision is
      // safe and actionable — unlike an email, it reveals nothing private.
      throw errors.conflict('That URL name is already taken. Choose another.', {
        field: 'slug',
      });
    }
    throw error;
  }

  await recordAuditEvent({
    action: 'ORGANIZATION_CREATED',
    actor: ownerUserId,
    subject: organizationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
    detail: { type: input.type, slug: input.slug },
  });

  return { organizationId };
}

/** An organization with its members. Caller must already be authorized. */
export async function getOrganization(organizationId: string) {
  const organization = await db().organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    include: {
      members: {
        where: { leftAt: null },
        include: {
          user: { select: { id: true, displayName: true, email: true } },
        },
      },
      locations: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' } },
    },
  });

  if (!organization) throw errors.notFound('Organization');
  return organization;
}

/** Organizations a user belongs to. */
export async function listUserOrganizations(userId: string) {
  const memberships = await db().organizationMember.findMany({
    where: { userId, leftAt: null, organization: { deletedAt: null } },
    include: { organization: true },
    orderBy: { joinedAt: 'asc' },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    type: m.organization.type,
    status: m.organization.status,
    roleKey: m.roleKey,
    isPrimary: m.isPrimary,
    verifiedAt: m.organization.verifiedAt,
  }));
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** Seven days: long enough to survive a holiday, short enough to expire. */
const INVITATION_TTL_DAYS = 7;

function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export interface IssuedInvitation {
  readonly invitationId: string;
  /** Returned once. Only its hash is stored. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Invite someone to an organization.
 *
 * Addressed to an EMAIL, not a user, because the invitee usually has no account
 * yet. Re-inviting the same address revokes the previous invitation first, so
 * only one live invitation exists per address per organization — otherwise
 * every invitation ever sent stays redeemable until it expires.
 *
 * The role is checked against the registry and restricted to organization-scoped
 * roles. Without that, an invitation could grant `platform_admin`, turning a
 * clinic admin into a platform administrator maker.
 */
export async function inviteToOrganization(
  organizationId: string,
  input: InviteInput,
  invitedByUserId: string,
  context: { requestId?: string } = {},
): Promise<IssuedInvitation> {
  const role = ROLE_BY_KEY.get(input.roleKey);
  if (!role || !role.assignable) {
    throw errors.validation('That role cannot be assigned.', { field: 'roleKey' });
  }

  // Someone already in the organization does not need an invitation, and
  // sending one would create a second membership row on acceptance.
  const existingMember = await db().organizationMember.findFirst({
    where: { organizationId, leftAt: null, user: { email: input.email } },
  });
  if (existingMember) {
    throw errors.conflict('That person is already a member of this organization.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);
  const invitationId = newId('request');

  await transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { organizationId, email: input.email, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    await tx.invitation.create({
      data: {
        id: invitationId,
        organizationId,
        email: input.email,
        roleKey: input.roleKey,
        tokenHash: hashInvitationToken(token),
        invitedByUserId,
        expiresAt,
      },
    });
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_INVITE_SENT',
    actor: invitedByUserId,
    subject: invitationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
    detail: { roleKey: input.roleKey },
  });

  return { invitationId, token, expiresAt };
}

/**
 * Accept an invitation.
 *
 * The accepting user's email must match the invited address. Without that
 * check, anyone holding the token — forwarded, leaked from an inbox, found in a
 * shared mailbox — could join an organization they were never invited to.
 *
 * Membership, role assignment and invitation status are one transaction: a
 * membership without its role assignment would be a member who can see nothing.
 */
export async function acceptInvitation(
  token: string,
  acceptingUserId: string,
  context: { requestId?: string } = {},
): Promise<{ organizationId: string; roleKey: string }> {
  const invitation = await db().invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
  });

  if (!invitation) throw errors.notFound('Invitation');
  if (invitation.status !== 'PENDING') {
    throw errors.preconditionFailed('That invitation is no longer valid.');
  }
  if (invitation.expiresAt <= new Date()) {
    await db().invitation.update({
      where: { id: invitation.id },
      data: { status: 'EXPIRED' },
    });
    throw errors.preconditionFailed('That invitation has expired. Ask for a new one.');
  }

  const user = await db().user.findUnique({ where: { id: acceptingUserId } });
  if (!user) throw errors.notFound('Account');

  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    await recordAuditEvent({
      action: 'ORGANIZATION_INVITE_ACCEPT',
      actor: acceptingUserId,
      subject: invitation.id,
      outcome: 'denied',
      organizationId: invitation.organizationId,
      requestId: context.requestId,
      detail: { reason: 'email_mismatch' },
    });
    throw errors.forbidden();
  }

  await transaction(async (tx) => {
    await tx.organizationMember.create({
      data: {
        id: newId('organizationMember'),
        userId: acceptingUserId,
        organizationId: invitation.organizationId,
        roleKey: invitation.roleKey,
      },
    });

    await tx.roleAssignment.create({
      data: {
        id: newId('request'),
        userId: acceptingUserId,
        roleKey: invitation.roleKey,
        organizationId: invitation.organizationId,
        grantedByUserId: invitation.invitedByUserId,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedByUserId: acceptingUserId,
      },
    });

    await emitInTransaction(
      tx,
      'ORGANIZATION_MEMBER_JOINED',
      { organizationId: invitation.organizationId, userId: acceptingUserId, roleKey: invitation.roleKey },
      { requestId: context.requestId, actor: acceptingUserId },
    );
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_INVITE_ACCEPT',
    actor: acceptingUserId,
    subject: invitation.id,
    outcome: 'success',
    organizationId: invitation.organizationId,
    requestId: context.requestId,
    detail: { roleKey: invitation.roleKey },
  });

  return { organizationId: invitation.organizationId, roleKey: invitation.roleKey };
}

/** Revoke a pending invitation. */
export async function revokeInvitation(
  invitationId: string,
  organizationId: string,
  actorUserId: string,
): Promise<void> {
  // Scoped by organizationId as well as id, so an invitation belonging to a
  // different organization is simply not found rather than revoked.
  const result = await db().invitation.updateMany({
    where: { id: invitationId, organizationId, status: 'PENDING' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });

  if (result.count === 0) throw errors.notFound('Pending invitation');

  await recordAuditEvent({
    action: 'ORGANIZATION_INVITE_REVOKED',
    actor: actorUserId,
    subject: invitationId,
    outcome: 'success',
    organizationId,
  });
}

/** Pending invitations for an organization. */
export async function listInvitations(organizationId: string) {
  return db().invitation.findMany({
    where: { organizationId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      roleKey: true,
      expiresAt: true,
      createdAt: true,
      // tokenHash is deliberately never selected: it must not reach a response.
    },
  });
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * Remove a member.
 *
 * Refuses to remove the last administrator. An organization with no admin
 * cannot invite, cannot configure itself and cannot recover — it is only
 * fixable by a database edit, so the check belongs here rather than in the UI.
 */
export async function removeMember(
  organizationId: string,
  userId: string,
  actorUserId: string,
): Promise<void> {
  await transaction(async (tx) => {
    const membership = await tx.organizationMember.findFirst({
      where: { organizationId, userId, leftAt: null },
    });
    if (!membership) throw errors.notFound('Member');

    if (membership.roleKey === 'clinic_admin') {
      const adminCount = await tx.organizationMember.count({
        where: { organizationId, roleKey: 'clinic_admin', leftAt: null },
      });
      if (adminCount <= 1) {
        throw errors.preconditionFailed(
          'This is the only administrator. Promote another member before removing this one.',
        );
      }
    }

    await tx.organizationMember.update({
      where: { id: membership.id },
      data: { leftAt: new Date() },
    });

    // The role assignment is deleted, not soft-deleted: a stale assignment
    // would keep granting permissions to someone who has left.
    await tx.roleAssignment.deleteMany({ where: { userId, organizationId } });
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_MEMBER_REMOVED',
    actor: actorUserId,
    subject: userId,
    outcome: 'success',
    organizationId,
  });
}

/** Change a member's role within an organization. */
export async function changeMemberRole(
  organizationId: string,
  userId: string,
  roleKey: (typeof ORGANIZATION_ROLES)[number],
  actorUserId: string,
): Promise<void> {
  const role = ROLE_BY_KEY.get(roleKey);
  if (!role || !role.assignable) {
    throw errors.validation('That role cannot be assigned.', { field: 'roleKey' });
  }

  await transaction(async (tx) => {
    const membership = await tx.organizationMember.findFirst({
      where: { organizationId, userId, leftAt: null },
    });
    if (!membership) throw errors.notFound('Member');

    // Same last-admin protection as removal: demoting the only admin is
    // equivalent to removing them.
    if (membership.roleKey === 'clinic_admin' && roleKey !== 'clinic_admin') {
      const adminCount = await tx.organizationMember.count({
        where: { organizationId, roleKey: 'clinic_admin', leftAt: null },
      });
      if (adminCount <= 1) {
        throw errors.preconditionFailed(
          'This is the only administrator. Promote another member first.',
        );
      }
    }

    await tx.organizationMember.update({
      where: { id: membership.id },
      data: { roleKey },
    });

    await tx.roleAssignment.deleteMany({ where: { userId, organizationId } });
    await tx.roleAssignment.create({
      data: {
        id: newId('request'),
        userId,
        roleKey,
        organizationId,
        grantedByUserId: actorUserId,
      },
    });
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
    actor: actorUserId,
    subject: userId,
    outcome: 'success',
    organizationId,
    detail: { roleKey },
  });
}
