/**
 * TOOTHLOGY ACCOUNT ERASURE
 *
 * Runs the erasure a user requested once the 30-day grace period has passed.
 *
 * WHAT ERASURE MEANS HERE
 * Personal data is scrubbed; the user row survives as an anonymous husk. It
 * survives because other records legitimately reference it — the audit trail
 * (which Constitution §8 forbids deleting), an appointment a clinic must keep
 * for its own clinical records, an invoice the tax authority can ask for. A
 * hard delete would either cascade those away or leave them pointing at
 * nothing; anonymising keeps them intact and keeps them about nobody.
 *
 * Files are soft-deleted with a retention date by purpose: an avatar can go at
 * once, an invoice must be kept for the statutory period. The purge job removes
 * the bytes when that date passes.
 */

import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { logger } from '../observability/logger';

/** Retention after erasure, by file purpose. Unlisted purposes: immediate. */
const RETENTION_DAYS: Readonly<Record<string, number>> = {
  // Indian GST rules require invoices be kept for 72 months.
  INVOICE: 6 * 365,
  AGREEMENT: 6 * 365,
  // Clinical documents: the clinic's legal record-keeping duty, commonly
  // three years in India for dental records and longer elsewhere.
  PRESCRIPTION: 3 * 365,
  DENTAL_REPORT: 3 * 365,
  XRAY: 3 * 365,
  CBCT: 3 * 365,
};

export async function processDueErasures(limit = 25): Promise<{ erased: number; failed: number }> {
  const due = await db().accountDeletionRequest.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
  });

  let erased = 0;
  let failed = 0;

  for (const request of due) {
    try {
      await eraseAccount(request.userId, request.id);
      erased += 1;
    } catch (error) {
      failed += 1;
      logger.error('Account erasure failed', { userId: request.userId, error });
    }
  }

  return { erased, failed };
}

export async function eraseAccount(userId: string, deletionRequestId: string): Promise<void> {
  const now = new Date();

  await transaction(async (tx) => {
    // Re-checked inside the transaction: the user may have restored the
    // account between the job's query and this write.
    const request = await tx.accountDeletionRequest.findUnique({ where: { id: deletionRequestId } });
    if (!request || request.status !== 'PENDING') return;

    await tx.user.update({
      where: { id: userId },
      data: {
        email: null,
        phone: null,
        displayName: 'Deleted user',
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        avatarFileId: null,
        status: 'DEACTIVATED',
        erasedAt: now,
        deletedAt: now,
      },
    });

    await tx.credential.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.verificationToken.deleteMany({ where: { userId } });
    await tx.savedLocation.deleteMany({ where: { userId } });
    await tx.notificationPreference.deleteMany({ where: { userId } });
    await tx.userPreference.deleteMany({ where: { userId } });
    await tx.inAppNotification.deleteMany({ where: { userId } });
    await tx.profile.updateMany({
      where: { userId },
      data: { displayName: null, headline: null, bio: null, isPublic: false, deletedAt: now },
    });
    // Organization memberships end; the organization itself belongs to its
    // other members and is untouched.
    await tx.organizationMember.updateMany({ where: { userId, leftAt: null }, data: { leftAt: now } });
    await tx.roleAssignment.deleteMany({ where: { userId } });

    // The dental record stays (the practices' record-keeping duty), but nobody
    // may newly read it: open grants and requests end.
    await tx.recordAccessGrant.updateMany({
      where: { patientUserId: userId, status: { in: ['REQUESTED', 'ACTIVE'] } },
      data: { status: 'REVOKED', endedAt: now, endedReason: 'Account erased', openKey: null },
    });

    // A dentist's public profile leaves search immediately.
    await tx.dentistProfile.updateMany({
      where: { userId },
      data: { isDiscoverable: false, deletedAt: now, bio: null, headline: null },
    });

    const files = await tx.fileObject.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      select: { id: true, purpose: true },
    });
    for (const file of files) {
      const days = RETENTION_DAYS[file.purpose] ?? 0;
      await tx.fileObject.update({
        where: { id: file.id },
        data: {
          status: 'DELETED',
          deletedAt: now,
          retainUntil: new Date(now.getTime() + days * 24 * 3600 * 1000),
        },
      });
    }

    await tx.accountDeletionRequest.update({
      where: { id: deletionRequestId },
      data: { status: 'COMPLETED', completedAt: now, reason: null },
    });
  });

  await recordAuditEvent({
    action: 'ACCOUNT_ERASED',
    actor: 'system:erasure',
    subject: userId,
    outcome: 'success',
  });
}
