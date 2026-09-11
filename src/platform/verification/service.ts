/**
 * TOOTHLOGY VERIFICATION SERVICE
 *
 * Constitution P2: *trust is earned in public and revocable.*
 *
 * A verification has a subject, an evidence trail, a named verifier, a
 * timestamp and an expiry. A badge that cannot be revoked is not a
 * verification — it is a permanent claim, and permanent claims about clinical
 * credentials are exactly what this platform exists to avoid.
 *
 * FOUR PROPERTIES ENFORCED HERE
 *
 * 1. **A reviewer is never the applicant.** Self-approval would make the whole
 *    mechanism decorative, and it is the first thing anyone would try.
 * 2. **Decisions are append-only.** A rejection is not deleted when the
 *    applicant resubmits; the history of what was checked IS the value.
 * 3. **Verification expires.** A credential checked five years ago is not
 *    evidence that the dentist is registered today.
 * 4. **Revocation is a state, not a deletion.** Withdrawing a badge leaves a
 *    record of why.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { recomputeDiscoverability } from '../dentists/service';

/**
 * How long a verification lasts.
 *
 * Two years balances two failure modes: too short and dentists are re-verified
 * constantly for no benefit; too long and the badge outlives the registration
 * it certifies. Dental council registrations are typically renewed annually or
 * biennially, so this tracks the underlying credential rather than an arbitrary
 * interval.
 */
export const VERIFICATION_VALIDITY_MONTHS = 24;

export const reviewDecisionSchema = z.object({
  verificationRequestId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  /**
   * Shown to the applicant. Required for a rejection: a refusal the applicant
   * cannot act on guarantees an identical resubmission and a second wasted
   * review.
   */
  decisionReason: z.string().trim().max(2000).optional(),
  /** Internal only, never shown to the applicant. */
  reviewerNotes: z.string().trim().max(4000).optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;

/** Requests awaiting review, oldest first so nothing starves. */
export async function listPendingVerifications(limit = 50) {
  return db().verificationRequest.findMany({
    where: { status: { in: ['PENDING', 'IN_REVIEW'] } },
    orderBy: { submittedAt: 'asc' },
    take: Math.min(limit, 200),
    include: {
      dentistProfile: {
        include: {
          user: { select: { id: true, displayName: true, email: true } },
          qualifications: true,
        },
      },
    },
  });
}

export interface EvidenceDocument {
  readonly fileId: string;
  readonly purpose: string;
}

function evidenceDocuments(evidence: unknown): EvidenceDocument[] {
  const documents = (evidence as { documents?: unknown } | null)?.documents;
  if (!Array.isArray(documents)) return [];
  return documents
    .filter((d): d is { fileId: string; purpose?: unknown } => typeof (d as { fileId?: unknown })?.fileId === 'string')
    .map((d) => ({ fileId: d.fileId, purpose: typeof d.purpose === 'string' ? d.purpose : 'OTHER' }));
}

/**
 * Pending requests with everything a reviewer needs to decide them: the
 * dentist and their credentials, or the organization and its registration
 * details, the person who submitted, and the documents cited as evidence.
 *
 * Without this an organization or clinic-claim request reaches the queue as
 * "unknown applicant" with nothing to check — and a reviewer who approves
 * what they cannot see is not verifying anything.
 */
export async function listPendingVerificationsForReview(limit = 50) {
  const pending = await listPendingVerifications(limit);
  const organizationIds = [
    ...new Set(
      pending
        .filter((r) => r.subjectType === 'ORGANIZATION' || r.subjectType === 'ORGANIZATION_CLAIM')
        .map((r) => r.subjectId),
    ),
  ];
  const submitterIds = [...new Set(pending.map((r) => r.submittedByUserId))];

  const [organizations, submitters] = await Promise.all([
    db().organization.findMany({
      where: { id: { in: organizationIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        countryCode: true,
        registrationNumber: true,
        taxIdentifier: true,
        ownerUserId: true,
        _count: { select: { locations: { where: { deletedAt: null } } } },
      },
    }),
    db().user.findMany({ where: { id: { in: submitterIds } }, select: { id: true, displayName: true, email: true } }),
  ]);
  const organizationById = new Map(organizations.map((o) => [o.id, o]));
  const submitterById = new Map(submitters.map((u) => [u.id, u]));

  return pending.map((request) => {
    const evidence = (request.submittedEvidence ?? {}) as Record<string, unknown>;
    return {
      request,
      organization: organizationById.get(request.subjectId) ?? null,
      submitter: submitterById.get(request.submittedByUserId) ?? null,
      documents: evidenceDocuments(request.submittedEvidence),
      claimRole: typeof evidence.role === 'string' ? evidence.role : null,
      note: typeof evidence.note === 'string' ? evidence.note : null,
    };
  });
}

/**
 * Approve or reject a verification request.
 *
 * The whole decision — request status, profile status, qualification flags,
 * expiry — is one transaction. A profile marked VERIFIED whose qualification
 * rows were not flagged would display a verified badge above credentials the
 * public profile then filters out as unverified, which reads as a bug and
 * erodes exactly the trust the badge exists to create.
 */
export async function reviewVerification(
  rawInput: ReviewDecisionInput,
  reviewerUserId: string,
  context: { requestId?: string } = {},
): Promise<{ status: 'APPROVED' | 'REJECTED'; expiresAt: Date | null }> {
  const parsed = reviewDecisionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The review decision is not valid.', {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }
  const input = parsed.data;

  if (input.decision === 'REJECTED' && !input.decisionReason) {
    throw errors.validation(
      'A rejection needs a reason the applicant can act on.',
      { field: 'decisionReason' },
    );
  }

  const request = await db().verificationRequest.findUnique({
    where: { id: input.verificationRequestId },
  });

  if (!request) throw errors.notFound('Verification request');

  if (request.status !== 'PENDING' && request.status !== 'IN_REVIEW') {
    throw errors.preconditionFailed(
      `This request has already been ${request.status.toLowerCase()}.`,
    );
  }

  /*
   * A reviewer may not decide their own application.
   *
   * This is the check that makes verification mean anything. Without it, a
   * dentist who also holds a moderator role simply approves themselves — and
   * on a platform where staff are recruited from the profession, that overlap
   * is the normal case rather than an edge case.
   */
  if (request.submittedByUserId === reviewerUserId) {
    await recordAuditEvent({
      action: 'VERIFICATION_REVIEWED',
      actor: reviewerUserId,
      subject: request.id,
      outcome: 'denied',
      requestId: context.requestId,
      detail: { reason: 'self_review_attempt' },
    });
    throw errors.forbidden();
  }

  const now = new Date();
  const expiresAt =
    input.decision === 'APPROVED'
      ? new Date(
          new Date(now).setMonth(now.getMonth() + VERIFICATION_VALIDITY_MONTHS),
        )
      : null;

  const dentistUserId = request.dentistProfileId
    ? (await db().dentistProfile.findUnique({
        where: { id: request.dentistProfileId },
        select: { userId: true },
      }))?.userId
    : undefined;

  await transaction(async (tx) => {
    // The decision event is written with the decision, so the applicant is told
    // about exactly the decisions that committed — never one that rolled back.
    if (request.subjectType === 'DENTIST' && dentistUserId) {
      await emitInTransaction(
        tx,
        'DENTIST_VERIFIED',
        {
          userId: dentistUserId,
          dentistProfileId: request.dentistProfileId,
          decision: input.decision,
          reason: input.decisionReason ?? null,
        },
        { requestId: context.requestId, actor: reviewerUserId },
      );
    }
    if (request.subjectType === 'ORGANIZATION') {
      await emitInTransaction(
        tx,
        'CLINIC_VERIFIED',
        { organizationId: request.subjectId, decision: input.decision, reason: input.decisionReason ?? null },
        { requestId: context.requestId, actor: reviewerUserId },
      );
    }

    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: input.decision,
        reviewedByUserId: reviewerUserId,
        reviewedAt: now,
        decisionReason: input.decisionReason ?? null,
        reviewerNotes: input.reviewerNotes ?? null,
        expiresAt,
      },
    });

    if (request.dentistProfileId) {
      await tx.dentistProfile.update({
        where: { id: request.dentistProfileId },
        data:
          input.decision === 'APPROVED'
            ? {
                status: 'VERIFIED',
                isVerified: true,
                verifiedAt: now,
                verificationExpiresAt: expiresAt,
              }
            : {
                status: 'REJECTED',
                isVerified: false,
                verifiedAt: null,
                verificationExpiresAt: null,
                isDiscoverable: false,
              },
      });

      // Qualifications carrying a registration number are what the reviewer
      // actually checked, so only those are marked verified. A qualification
      // with no council number was not verifiable and must not inherit the
      // badge — the public profile shows only verified ones.
      if (input.decision === 'APPROVED') {
        await tx.qualification.updateMany({
          where: {
            dentistProfileId: request.dentistProfileId,
            registrationNumber: { not: null },
          },
          data: { isVerified: true, verifiedAt: now },
        });
      }
    }

    if (request.subjectType === 'ORGANIZATION') {
      await tx.organization.update({
        where: { id: request.subjectId },
        data:
          input.decision === 'APPROVED'
            ? { status: 'ACTIVE', verifiedAt: now, verificationExpires: expiresAt }
            : { verifiedAt: null, verificationExpires: null },
      });
    }

    // An approved claim hands an unowned listing to the claimant. Re-checked
    // inside the transaction: if another claim was approved first, the listing
    // is no longer unowned and this approval must fail rather than create two
    // owners.
    if (request.subjectType === 'ORGANIZATION_CLAIM' && input.decision === 'APPROVED') {
      const organization = await tx.organization.findUnique({
        where: { id: request.subjectId },
        select: { ownerUserId: true, _count: { select: { members: { where: { leftAt: null } } } } },
      });
      if (!organization || organization.ownerUserId !== null || organization._count.members > 0) {
        throw errors.preconditionFailed('This organization already has an owner. The claim cannot be approved.');
      }
      await tx.organization.update({
        where: { id: request.subjectId },
        data: { ownerUserId: request.submittedByUserId },
      });
      await tx.organizationMember.create({
        data: {
          id: newId('organizationMember'),
          userId: request.submittedByUserId,
          organizationId: request.subjectId,
          roleKey: 'clinic_admin',
          isPrimary: true,
        },
      });
      await tx.roleAssignment.create({
        data: {
          id: newId('roleAssignment'),
          userId: request.submittedByUserId,
          roleKey: 'clinic_admin',
          organizationId: request.subjectId,
          grantedByUserId: reviewerUserId,
        },
      });
      // A listing made from extracted data records who claimed it. The
      // extracted original is kept as it was.
      await tx.extractedRecord.updateMany({
        where: { premadeOrganizationId: request.subjectId, status: 'ACCOUNT_CREATED' },
        data: { status: 'CLAIMED', claimedAt: now },
      });
    }
  });

  // Outside the transaction: discoverability depends on practice locations,
  // and holding a transaction open across those reads would lock rows the
  // clinic may be editing.
  if (request.dentistProfileId) {
    await recomputeDiscoverability(request.dentistProfileId);
  }

  await recordAuditEvent({
    action: 'VERIFICATION_REVIEWED',
    actor: reviewerUserId,
    subject: request.id,
    outcome: 'success',
    requestId: context.requestId,
    detail: {
      decision: input.decision,
      subjectType: request.subjectType,
      subjectId: request.subjectId,
    },
  });

  return { status: input.decision, expiresAt };
}

/**
 * Revoke a verification.
 *
 * The capability that makes the badge honest (Constitution P2). Used when a
 * registration lapses, a credential turns out to be misrepresented, or a
 * council withdraws registration.
 *
 * The dentist leaves patient search immediately — a revoked verification that
 * took effect at the next reindex would keep matching patients with a dentist
 * whose registration has been withdrawn.
 */
export async function revokeVerification(
  verificationRequestId: string,
  reason: string,
  revokedByUserId: string,
  context: { requestId?: string } = {},
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    // A revocation with no stated reason is unauditable, and this record is
    // the evidence if the decision is ever challenged.
    throw errors.validation('Give a reason for the revocation (at least 10 characters).', {
      field: 'reason',
    });
  }

  const request = await db().verificationRequest.findUnique({
    where: { id: verificationRequestId },
  });

  if (!request) throw errors.notFound('Verification request');
  if (request.status !== 'APPROVED') {
    throw errors.preconditionFailed('Only an approved verification can be revoked.');
  }

  const now = new Date();

  const dentistUserId = request.dentistProfileId
    ? (await db().dentistProfile.findUnique({
        where: { id: request.dentistProfileId },
        select: { userId: true },
      }))?.userId
    : undefined;

  await transaction(async (tx) => {
    if (request.subjectType === 'DENTIST' && dentistUserId) {
      await emitInTransaction(
        tx,
        'DENTIST_VERIFIED',
        { userId: dentistUserId, dentistProfileId: request.dentistProfileId, decision: 'REVOKED', reason: reason.trim() },
        { requestId: context.requestId, actor: revokedByUserId },
      );
    }
    if (request.subjectType === 'ORGANIZATION') {
      await emitInTransaction(
        tx,
        'CLINIC_VERIFIED',
        { organizationId: request.subjectId, decision: 'REVOKED', reason: reason.trim() },
        { requestId: context.requestId, actor: revokedByUserId },
      );
    }

    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokedByUserId,
        revocationReason: reason.trim(),
      },
    });

    if (request.dentistProfileId) {
      await tx.dentistProfile.update({
        where: { id: request.dentistProfileId },
        data: {
          status: 'SUSPENDED',
          isVerified: false,
          verifiedAt: null,
          verificationExpiresAt: null,
          isDiscoverable: false,
        },
      });

      await tx.qualification.updateMany({
        where: { dentistProfileId: request.dentistProfileId },
        data: { isVerified: false, verifiedAt: null },
      });
    }

    if (request.subjectType === 'ORGANIZATION') {
      await tx.organization.update({
        where: { id: request.subjectId },
        data: { verifiedAt: null, verificationExpires: null, status: 'SUSPENDED' },
      });
    }
  });

  await recordAuditEvent({
    action: 'VERIFICATION_REVOKED',
    actor: revokedByUserId,
    subject: request.id,
    outcome: 'success',
    requestId: context.requestId,
    detail: { reason: reason.trim(), subjectId: request.subjectId },
  });
}

/**
 * Expire verifications past their date.
 *
 * Run by the maintenance job. Expiry has to be enforced by a sweep as well as
 * checked at read time: a dentist whose verification lapsed must actually leave
 * search, not merely fail a check on the rare occasion someone reads their
 * profile directly.
 */
export async function expireLapsedVerifications(): Promise<number> {
  const now = new Date();

  const lapsed = await db().verificationRequest.findMany({
    where: { status: 'APPROVED', expiresAt: { lte: now } },
    select: { id: true, dentistProfileId: true },
  });

  if (lapsed.length === 0) return 0;

  await db().verificationRequest.updateMany({
    where: { id: { in: lapsed.map((l) => l.id) } },
    data: { status: 'EXPIRED' },
  });

  const profileIds = lapsed
    .map((l) => l.dentistProfileId)
    .filter((id): id is string => id !== null);

  if (profileIds.length > 0) {
    await db().dentistProfile.updateMany({
      where: { id: { in: profileIds } },
      data: { isVerified: false, isDiscoverable: false, status: 'SUBMITTED' },
    });
  }

  return lapsed.length;
}

/** The verification history for a subject, newest first. */
export async function getVerificationHistory(subjectType: 'DENTIST' | 'ORGANIZATION', subjectId: string) {
  return db().verificationRequest.findMany({
    where: { subjectType, subjectId },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      reviewedAt: true,
      decisionReason: true,
      expiresAt: true,
      revokedAt: true,
      revocationReason: true,
      // reviewerNotes is deliberately never selected: it is internal, and this
      // is read by the applicant.
    },
  });
}
