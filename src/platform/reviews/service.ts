/**
 * TOOTHLOGY REVIEWS — tied to visits that took place
 *
 * COMPLETED APPOINTMENT → PATIENT REVIEWS (once) → PRACTICE RESPONDS (once,
 * editable) → PRACTICE MAY FLAG → MODERATOR HIDES OR RESTORES
 *
 * - Only the patient of a completed appointment reviews it, within 90 days of
 *   the visit, once. A review that cannot be tied to a real visit does not
 *   exist here (PHASES, Phase 5).
 * - The patient may edit it for 30 days, or remove it (text cleared).
 * - Phone numbers and email addresses are refused, as in the community.
 * - The practice replies once in public, and may flag a review for a
 *   moderator; flagging does not hide it — only a moderator does, with the
 *   reason the patient is told.
 * - In public a reviewer is a first name and an initial; an average is shown
 *   only from three reviews, so one visit cannot define a dentist.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { containsContactDetails } from '../../lib/contact-details';

export const RESPOND = 'tl.reviews.review.respond';
export const MODERATE = 'tl.reviews.review.moderate';
const DAY = 86_400_000;
export const REVIEW_WINDOW_DAYS = 90;
export const EDIT_WINDOW_DAYS = 30;
/** Fewer published reviews than this: the count is shown, not an average. */
export const MIN_FOR_AVERAGE = 3;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

function noContact(text: string | undefined | null, field: string) {
  if (text && containsContactDetails(text)) throw errors.validation('Do not include phone numbers or email addresses in a review.', { field });
}

/** "Priya Sharma" → "Priya S." — enough to be a person, not enough to find them. */
export function publicName(displayName: string | null): string {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A patient';
  return parts.length === 1 ? parts[0]! : `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}

// ---------------------------------------------------------------------------
// Patients
// ---------------------------------------------------------------------------

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose from 1 to 5 stars.').max(5, 'Choose from 1 to 5 stars.'),
  body: z.string().trim().max(2000).optional(),
});

/** Whether this patient may review this appointment now, and why not. */
export async function reviewability(principal: Principal, appointmentId: string, now: Date = new Date()) {
  const me = signedIn(principal);
  const appointment = await db().appointment.findUnique({ where: { id: appointmentId }, select: { patientUserId: true, status: true, completedAt: true, review: { select: { id: true, rating: true, body: true, status: true, createdAt: true } } } });
  if (!appointment || appointment.patientUserId !== me.userId) throw errors.notFound('Appointment');
  if (appointment.review) return { canReview: false, reason: 'REVIEWED' as const, review: appointment.review };
  if (appointment.status !== 'COMPLETED' || !appointment.completedAt) return { canReview: false, reason: 'NOT_COMPLETED' as const, review: null };
  if (appointment.completedAt.getTime() < now.getTime() - REVIEW_WINDOW_DAYS * DAY) return { canReview: false, reason: 'TOO_LATE' as const, review: null };
  return { canReview: true, reason: null, review: null };
}

export async function writeReview(principal: Principal, appointmentId: string, raw: z.input<typeof reviewSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = reviewSchema.parse(raw);
  noContact(input.body, 'body');
  const now = context.now ?? new Date();
  const check = await reviewability(me, appointmentId, now);
  if (!check.canReview) {
    throw check.reason === 'REVIEWED'
      ? errors.conflict('You already reviewed this visit. You can change your review instead.')
      : errors.preconditionFailed(check.reason === 'TOO_LATE' ? `Reviews are accepted for ${REVIEW_WINDOW_DAYS} days after a visit.` : 'You can review a visit once it has taken place.');
  }
  const appointment = await db().appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { dentistProfileId: true, organizationId: true, serviceName: true, dentistProfile: { select: { userId: true } } } });
  const id = newId('review');
  try {
    await transaction(async (tx) => {
      await tx.review.create({ data: { id, appointmentId, patientUserId: me.userId, dentistProfileId: appointment.dentistProfileId, organizationId: appointment.organizationId, rating: input.rating, body: input.body || null } });
      // Ids and the rating only: the text stays with the review.
      await emitInTransaction(tx, 'REVIEW_CREATED', { reviewId: id, appointmentId, organizationId: appointment.organizationId, dentistProfileId: appointment.dentistProfileId, rating: input.rating }, { requestId: context.requestId ?? null, actor: me.userId });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already reviewed this visit. You can change your review instead.');
    throw error;
  }
  await recordAuditEvent({ action: 'REVIEW_WRITTEN', actor: me.userId, subject: id, outcome: 'success', organizationId: appointment.organizationId, requestId: context.requestId, detail: { rating: input.rating } });
  // The seeded templates speak of "{rating}-star review".
  const data = { rating: input.rating };
  await notifyOrganizationAdmins({ organizationId: appointment.organizationId, notificationId: 'TL-NOTIF-REVIEW-RECEIVED-001', data, linkUrl: '/account/practice/reviews' });
  if (appointment.dentistProfile.userId !== me.userId) {
    await notifyUser({ userId: appointment.dentistProfile.userId, notificationId: 'TL-NOTIF-REVIEW-RECEIVED-001', data, linkUrl: '/account/practice/reviews' });
  }
  return { reviewId: id };
}

export async function editReview(principal: Principal, reviewId: string, raw: z.input<typeof reviewSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = reviewSchema.parse(raw);
  noContact(input.body, 'body');
  const now = context.now ?? new Date();
  const review = await db().review.findUnique({ where: { id: reviewId } });
  if (!review || review.patientUserId !== me.userId) throw errors.notFound('Review');
  if (review.status !== 'PUBLISHED') throw errors.preconditionFailed('This review can no longer be changed.');
  if (review.createdAt.getTime() < now.getTime() - EDIT_WINDOW_DAYS * DAY) throw errors.preconditionFailed(`A review can be changed for ${EDIT_WINDOW_DAYS} days after it was written.`);
  await db().review.update({ where: { id: reviewId }, data: { rating: input.rating, body: input.body || null, editedAt: now } });
  await recordAuditEvent({ action: 'REVIEW_EDITED', actor: me.userId, subject: reviewId, outcome: 'success', organizationId: review.organizationId, requestId: context.requestId, detail: { rating: input.rating } });
}

export async function removeReview(principal: Principal, reviewId: string, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const done = await db().review.updateMany({ where: { id: reviewId, patientUserId: me.userId, status: { not: 'REMOVED' } }, data: { status: 'REMOVED', body: null } });
  if (done.count === 0) throw errors.notFound('Review');
  await recordAuditEvent({ action: 'REVIEW_REMOVED', actor: me.userId, subject: reviewId, outcome: 'success', requestId: context.requestId });
}

// ---------------------------------------------------------------------------
// Practices
// ---------------------------------------------------------------------------

/** The practice (its administrators) or the treating dentist; nobody else. */
async function practiceSide(principal: AuthenticatedPrincipal, review: { organizationId: string; dentistProfileId: string }) {
  if (can(principal, RESPOND, { organizationId: review.organizationId })) return true;
  const dentist = await db().dentistProfile.findUnique({ where: { id: review.dentistProfileId }, select: { userId: true } });
  return dentist?.userId === principal.userId;
}

export const responseSchema = z.object({ body: z.string().trim().min(10, 'Write at least 10 characters.').max(2000) });

export async function respondToReview(principal: Principal, reviewId: string, raw: z.input<typeof responseSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const { body } = responseSchema.parse(raw);
  noContact(body, 'body');
  const review = await db().review.findUnique({ where: { id: reviewId }, include: { response: { select: { id: true } } } });
  if (!review || !(await practiceSide(me, review))) throw errors.notFound('Review');
  if (review.status !== 'PUBLISHED') throw errors.preconditionFailed('Only a published review can be answered.');
  const first = !review.response;
  await db().reviewResponse.upsert({ where: { reviewId }, create: { id: newId('reviewResponse'), reviewId, authorUserId: me.userId, body }, update: { body, authorUserId: me.userId } });
  await recordAuditEvent({ action: first ? 'REVIEW_RESPONDED' : 'REVIEW_RESPONSE_EDITED', actor: me.userId, subject: reviewId, outcome: 'success', organizationId: review.organizationId, requestId: context.requestId });
  if (first) await notifyUser({ userId: review.patientUserId, notificationId: 'TL-NOTIF-REVIEW-RESPONSE-001', data: { summary: 'The practice replied to your review.' }, linkUrl: '/account/reviews' });
}

export const flagSchema = z.object({ reason: z.string().trim().min(10, 'Say what is wrong with it, in at least 10 characters.').max(500) });

export async function flagReview(principal: Principal, reviewId: string, raw: z.input<typeof flagSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const { reason } = flagSchema.parse(raw);
  const review = await db().review.findUnique({ where: { id: reviewId } });
  if (!review || !(await practiceSide(me, review))) throw errors.notFound('Review');
  const done = await db().review.updateMany({ where: { id: reviewId, status: 'PUBLISHED', flaggedAt: null }, data: { flaggedAt: context.now ?? new Date(), flagReason: reason, flaggedByUserId: me.userId } });
  if (done.count === 0) throw errors.preconditionFailed('This review is already with a moderator, or not published.');
  await recordAuditEvent({ action: 'REVIEW_FLAGGED', actor: me.userId, subject: reviewId, outcome: 'success', organizationId: review.organizationId, requestId: context.requestId, detail: { reason } });
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export const moderateSchema = z.object({ action: z.enum(['HIDE', 'RESTORE', 'KEEP']), reason: z.string().trim().max(500).optional() });

export async function moderateReview(principal: Principal, reviewId: string, raw: z.input<typeof moderateSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  if (!can(me, MODERATE)) throw errors.forbidden(MODERATE);
  const input = moderateSchema.parse(raw);
  if (input.action === 'HIDE' && !input.reason) throw errors.validation('Give the reason the patient will see.', { field: 'reason' });
  const review = await db().review.findUnique({ where: { id: reviewId } });
  if (!review || review.status === 'REMOVED') throw errors.notFound('Review');
  const data =
    input.action === 'HIDE'
      ? { status: 'HIDDEN' as const, hiddenReason: input.reason!, flaggedAt: null, flagReason: null }
      : input.action === 'RESTORE'
        ? { status: 'PUBLISHED' as const, hiddenReason: null }
        : { flaggedAt: null, flagReason: null };
  await db().review.update({ where: { id: reviewId }, data });
  await recordAuditEvent({ action: `REVIEW_${input.action}`, actor: me.userId, subject: reviewId, outcome: 'success', organizationId: review.organizationId, requestId: context.requestId, detail: { reason: input.reason ?? null } });
  if (input.action === 'HIDE') await notifyUser({ userId: review.patientUserId, notificationId: 'TL-NOTIF-REVIEW-MODERATION-001', data: { summary: `A moderator hid your review: ${input.reason}` }, linkUrl: '/account/reviews' });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type RatingSummary = { count: number; average: number | null; distribution: Record<1 | 2 | 3 | 4 | 5, number> };

export async function ratingSummary(where: { dentistProfileId?: string; organizationId?: string }): Promise<RatingSummary> {
  const rows = await db().review.groupBy({ by: ['rating'], where: { ...where, status: 'PUBLISHED' }, _count: true });
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  let count = 0;
  let total = 0;
  for (const r of rows) {
    distribution[r.rating as 1 | 2 | 3 | 4 | 5] = r._count;
    count += r._count;
    total += r.rating * r._count;
  }
  return { count, average: count >= MIN_FOR_AVERAGE ? Math.round((total / count) * 10) / 10 : null, distribution };
}

export async function listPublicReviews(where: { dentistProfileId?: string; organizationId?: string }, take = 20) {
  const rows = await db().review.findMany({
    where: { ...where, status: 'PUBLISHED' },
    include: { patient: { select: { displayName: true } }, appointment: { select: { serviceName: true, startsAt: true } }, response: { select: { body: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map((r) => ({ id: r.id, rating: r.rating, body: r.body, edited: r.editedAt !== null, createdAt: r.createdAt, reviewer: publicName(r.patient.displayName), service: r.appointment.serviceName, visitMonth: r.appointment.startsAt, response: r.response }));
}

export async function myReviews(principal: Principal) {
  const me = signedIn(principal);
  return db().review.findMany({
    where: { patientUserId: me.userId, status: { not: 'REMOVED' } },
    include: { dentistProfile: { select: { slug: true, isDiscoverable: true, user: { select: { displayName: true } } } }, appointment: { select: { serviceName: true, startsAt: true } }, response: { select: { body: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/** Reviews of the practices the caller answers for, and of themselves as a dentist. */
export async function practiceReviews(principal: Principal) {
  const me = signedIn(principal);
  const orgIds = me.organizations.map((o) => o.organizationId).filter((organizationId) => can(me, RESPOND, { organizationId }));
  const profile = await db().dentistProfile.findUnique({ where: { userId: me.userId }, select: { id: true } });
  if (orgIds.length === 0 && !profile) return [];
  return db().review.findMany({
    where: { status: { in: ['PUBLISHED', 'HIDDEN'] }, OR: [...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []), ...(profile ? [{ dentistProfileId: profile.id }] : [])] },
    include: {
      patient: { select: { displayName: true } },
      appointment: { select: { serviceName: true, startsAt: true } },
      dentistProfile: { select: { user: { select: { displayName: true } } } },
      organization: { select: { name: true } },
      response: { select: { body: true, updatedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

export async function reviewModerationQueue(principal: Principal) {
  const me = signedIn(principal);
  if (!can(me, MODERATE)) throw errors.forbidden(MODERATE);
  return db().review.findMany({
    where: { OR: [{ flaggedAt: { not: null }, status: 'PUBLISHED' }, { status: 'HIDDEN' }] },
    include: { dentistProfile: { select: { user: { select: { displayName: true } } } }, organization: { select: { name: true } }, appointment: { select: { serviceName: true } } },
    orderBy: [{ flaggedAt: 'asc' }, { updatedAt: 'desc' }],
    take: 300,
  });
}
