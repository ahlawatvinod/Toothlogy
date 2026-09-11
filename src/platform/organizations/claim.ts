/**
 * TOOTHLOGY CLINIC CLAIMS
 *
 * A clinic listing can exist before anyone from the clinic joins — created by
 * Toothlogy staff from public registries, so patients can find it. Such a
 * listing has no owner and no members. A person who runs the clinic claims
 * it with evidence; a reviewer checks the evidence; approval makes the
 * claimant its owner and administrator.
 *
 * WHY A CLAIM IS A VERIFICATION, NOT A BUTTON
 * "Claim this clinic" without evidence is how a competitor takes over a
 * rival's listing and redirects its patients. So a claim is a verification
 * request, decided by a reviewer who is never the claimant, and approval is
 * refused if the listing gained an owner in the meantime.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { createOrganizationSchema } from './service';

const EVIDENCE_PURPOSES = ['CERTIFICATE', 'AGREEMENT', 'IDENTITY_DOCUMENT', 'DENTIST_LICENSE', 'OTHER'] as const;

export const claimSchema = z.object({
  /** Evidence the claimant uploaded as themselves: registration certificate, licence, ID. */
  documentFileIds: z.array(z.string().max(64)).min(1, 'Attach at least one document.').max(10),
  /** The claimant's role at the clinic, in their words. */
  role: z.string().trim().min(2).max(120),
  note: z.string().trim().max(2000).optional(),
});

/** Whether an organization is an unclaimed listing. */
export async function isUnclaimed(organizationId: string): Promise<boolean> {
  const organization = await db().organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { ownerUserId: true, _count: { select: { members: { where: { leftAt: null } } } } },
  });
  return Boolean(organization && organization.ownerUserId === null && organization._count.members === 0);
}

export async function claimOrganization(
  organizationId: string,
  userId: string,
  rawInput: z.infer<typeof claimSchema>,
  context: { requestId?: string } = {},
): Promise<{ verificationRequestId: string }> {
  const parsed = claimSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The claim details are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const input = parsed.data;

  if (!(await isUnclaimed(organizationId))) {
    throw errors.preconditionFailed('This organization is already managed on Toothlogy. Ask its administrators to invite you.');
  }

  const open = await db().verificationRequest.count({
    where: {
      subjectType: 'ORGANIZATION_CLAIM',
      subjectId: organizationId,
      submittedByUserId: userId,
      status: { in: ['PENDING', 'IN_REVIEW'] },
    },
  });
  if (open > 0) throw errors.preconditionFailed('Your claim for this organization is already awaiting review.');

  const files = await db().fileObject.findMany({
    where: {
      id: { in: input.documentFileIds },
      ownerUserId: userId,
      status: 'ACTIVE',
      purpose: { in: [...EVIDENCE_PURPOSES] },
    },
    select: { id: true, purpose: true },
  });
  if (files.length !== input.documentFileIds.length) {
    throw errors.validation('Upload the documents yourself before attaching them.', { field: 'documentFileIds' });
  }

  const id = newId('verification');
  await db().verificationRequest.create({
    data: {
      id,
      subjectType: 'ORGANIZATION_CLAIM',
      subjectId: organizationId,
      status: 'PENDING',
      submittedByUserId: userId,
      submittedEvidence: {
        role: input.role,
        note: input.note ?? null,
        documents: files.map((f) => ({ fileId: f.id, purpose: f.purpose })),
      } as never,
    },
  });

  await recordAuditEvent({
    action: 'ORGANIZATION_CLAIM_SUBMITTED',
    actor: userId,
    subject: organizationId,
    outcome: 'success',
    requestId: context.requestId,
  });

  return { verificationRequestId: id };
}

/**
 * Create an unowned listing. Platform staff only (`tl.admin.organization.create`
 * at the route). It starts PENDING and unverified, and is claimable.
 */
export async function createListingOrganization(
  rawInput: z.infer<typeof createOrganizationSchema>,
  adminUserId: string,
): Promise<{ organizationId: string }> {
  const parsed = createOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The organization details are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const input = parsed.data;
  const organizationId = newId('organization');
  await db().organization.create({
    data: {
      id: organizationId,
      type: input.type,
      name: input.name,
      slug: input.slug,
      countryCode: input.countryCode,
      timezone: input.timezone,
      currency: input.currency ?? 'INR',
      status: 'PENDING',
      ownerUserId: null,
    },
  });
  await recordAuditEvent({
    action: 'ORGANIZATION_LISTING_CREATED',
    actor: adminUserId,
    subject: organizationId,
    outcome: 'success',
    organizationId,
  });
  return { organizationId };
}
