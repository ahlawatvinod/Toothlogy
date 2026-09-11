/**
 * TOOTHLOGY ORGANIZATION MANAGEMENT
 *
 * Profile, verification submission, membership changes and ownership.
 *
 * TWO RULES WORTH STATING
 *
 * 1. **Changing what verification checked un-verifies.** A verified clinic
 *    that edits its registration number or tax identifier drops back to
 *    PENDING — the badge certified the old numbers, not whatever was typed
 *    afterwards. Cosmetic edits (description, phone) do not.
 * 2. **The owner is protected.** Administrators manage; the owner is the one
 *    accountable party and cannot be demoted or removed by another admin —
 *    ownership moves only by the owner's own transfer.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { getVerificationHistory } from '../verification/service';
import { changeMemberRole, removeMember, type ORGANIZATION_ROLES } from './service';

export const updateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    website: z.string().trim().url('Enter a full web address, e.g. https://…').max(300).nullable().optional(),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210.').nullable().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    registrationNumber: z.string().trim().max(80).nullable().optional(),
    taxIdentifier: z.string().trim().max(40).nullable().optional(),
    logoFileId: z.string().max(64).nullable().optional(),
  })
  .strict();

export async function updateOrganizationProfile(
  organizationId: string,
  rawInput: z.infer<typeof updateOrganizationSchema>,
  actorUserId: string,
  context: { requestId?: string } = {},
) {
  const parsed = updateOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The organization details are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const input = parsed.data;

  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null } });
  if (!organization) throw errors.notFound('Organization');

  if (input.logoFileId) {
    const logo = await db().fileObject.findFirst({
      where: { id: input.logoFileId, ownerOrganizationId: organizationId, purpose: 'ORGANIZATION_LOGO', status: 'ACTIVE' },
    });
    if (!logo) throw errors.validation('Upload the logo for this organization first.', { field: 'logoFileId' });
  }

  const credentialChanged =
    (input.registrationNumber !== undefined && input.registrationNumber !== organization.registrationNumber) ||
    (input.taxIdentifier !== undefined && input.taxIdentifier !== organization.taxIdentifier);
  const unverify = credentialChanged && organization.verifiedAt !== null;

  const updated = await db().organization.update({
    where: { id: organizationId },
    data: {
      ...input,
      ...(unverify ? { verifiedAt: null, verificationExpires: null, status: 'PENDING' as const } : {}),
    },
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_UPDATED',
    actor: actorUserId,
    subject: organizationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
    detail: { fields: Object.keys(input), verificationCleared: unverify },
  });

  return { organization: updated, verificationCleared: unverify };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const organizationVerificationSchema = z.object({
  /** Files uploaded for this organization as evidence (registration certificate, licence). */
  documentFileIds: z.array(z.string().max(64)).min(1, 'Attach at least one document.').max(10),
  note: z.string().trim().max(2000).optional(),
});

const EVIDENCE_PURPOSES = ['CERTIFICATE', 'AGREEMENT', 'IDENTITY_DOCUMENT', 'DENTIST_LICENSE', 'OTHER'];

/**
 * Submit an organization for verification. Completeness is checked first and
 * every missing item is named — a submission a reviewer must reject for an
 * absent document wastes both sides' time.
 */
export async function submitOrganizationVerification(
  organizationId: string,
  actorUserId: string,
  input: z.infer<typeof organizationVerificationSchema>,
  context: { requestId?: string } = {},
): Promise<{ verificationRequestId: string }> {
  const organization = await db().organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    include: { locations: { where: { deletedAt: null } } },
  });
  if (!organization) throw errors.notFound('Organization');

  const open = await db().verificationRequest.count({
    where: { subjectType: 'ORGANIZATION', subjectId: organizationId, status: { in: ['PENDING', 'IN_REVIEW'] } },
  });
  if (open > 0) throw errors.preconditionFailed('This organization is already awaiting review.');

  const missing: string[] = [];
  if (!organization.registrationNumber) missing.push('a registration number');
  if (organization.type === 'CLINIC' || organization.type === 'HOSPITAL') {
    if (!organization.locations.some((l) => l.latitude !== null && l.addressId !== null)) {
      missing.push('at least one location with an address and map position');
    }
  }

  const files = await db().fileObject.findMany({
    where: {
      id: { in: input.documentFileIds },
      ownerOrganizationId: organizationId,
      status: 'ACTIVE',
      purpose: { in: EVIDENCE_PURPOSES as never },
    },
    select: { id: true, purpose: true },
  });
  if (files.length !== input.documentFileIds.length) {
    missing.push('documents uploaded for this organization (one or more files were not found or belong elsewhere)');
  }

  if (missing.length > 0) {
    throw errors.preconditionFailed(`Before submitting, add ${missing.join('; ')}.`, { missing });
  }

  const id = newId('verification');
  await db().verificationRequest.create({
    data: {
      id,
      subjectType: 'ORGANIZATION',
      subjectId: organizationId,
      status: 'PENDING',
      submittedByUserId: actorUserId,
      submittedEvidence: {
        organizationType: organization.type,
        name: organization.name,
        registrationNumber: organization.registrationNumber,
        taxIdentifier: organization.taxIdentifier,
        documents: files.map((f) => ({ fileId: f.id, purpose: f.purpose })),
        note: input.note ?? null,
      } as never,
    },
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_VERIFICATION_SUBMITTED',
    actor: actorUserId,
    subject: organizationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
  });

  return { verificationRequestId: id };
}

export function organizationVerificationHistory(organizationId: string) {
  return getVerificationHistory('ORGANIZATION', organizationId);
}

// ---------------------------------------------------------------------------
// Membership and ownership
// ---------------------------------------------------------------------------

async function ownerOf(organizationId: string): Promise<string | null> {
  const organization = await db().organization.findUnique({
    where: { id: organizationId },
    select: { ownerUserId: true },
  });
  return organization?.ownerUserId ?? null;
}

export async function setMemberRole(
  organizationId: string,
  userId: string,
  roleKey: (typeof ORGANIZATION_ROLES)[number],
  actorUserId: string,
): Promise<void> {
  if ((await ownerOf(organizationId)) === userId && roleKey !== 'clinic_admin') {
    throw errors.preconditionFailed('The owner stays an administrator. Transfer ownership first.');
  }
  await changeMemberRole(organizationId, userId, roleKey, actorUserId);
}

export async function removeOrganizationMember(
  organizationId: string,
  userId: string,
  actorUserId: string,
): Promise<void> {
  if ((await ownerOf(organizationId)) === userId) {
    throw errors.preconditionFailed('The owner cannot be removed. Transfer ownership first.');
  }
  await removeMember(organizationId, userId, actorUserId);
}

/**
 * Transfer ownership to another member. Only the current owner may do it; the
 * new owner is made an administrator if they are not one already.
 */
export async function transferOwnership(
  organizationId: string,
  actorUserId: string,
  newOwnerUserId: string,
  context: { requestId?: string } = {},
): Promise<void> {
  const owner = await ownerOf(organizationId);
  if (owner !== actorUserId) throw errors.forbidden();
  if (newOwnerUserId === actorUserId) throw errors.validation('You already own this organization.');

  await transaction(async (tx) => {
    const membership = await tx.organizationMember.findFirst({
      where: { organizationId, userId: newOwnerUserId, leftAt: null },
    });
    if (!membership) throw errors.validation('The new owner must already be a member.', { field: 'newOwnerUserId' });

    if (membership.roleKey !== 'clinic_admin') {
      await tx.organizationMember.update({ where: { id: membership.id }, data: { roleKey: 'clinic_admin' } });
      await tx.roleAssignment.deleteMany({ where: { userId: newOwnerUserId, organizationId } });
      await tx.roleAssignment.create({
        data: {
          id: newId('roleAssignment'),
          userId: newOwnerUserId,
          roleKey: 'clinic_admin',
          organizationId,
          grantedByUserId: actorUserId,
        },
      });
    }

    await tx.organizationMember.updateMany({ where: { organizationId }, data: { isPrimary: false } });
    await tx.organizationMember.update({ where: { id: membership.id }, data: { isPrimary: true } });
    await tx.organization.update({ where: { id: organizationId }, data: { ownerUserId: newOwnerUserId } });
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_OWNERSHIP_TRANSFERRED',
    actor: actorUserId,
    subject: organizationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
    detail: { from: actorUserId, to: newOwnerUserId },
  });
}
