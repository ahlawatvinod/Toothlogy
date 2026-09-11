/**
 * TL-TEST-REVIEWS-001 — reviews tied to visits that took place.
 *
 * Only the patient of a completed appointment, within 90 days, once; edits
 * for 30 days; removal clears text; contact details refused. The practice
 * or treating dentist replies once and flags; only moderators hide, with a
 * reason the patient is told; summaries count published reviews only and
 * give an average from three; access for nobody else.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import {
  editReview,
  flagReview,
  listPublicReviews,
  moderateReview,
  practiceReviews,
  publicName,
  ratingSummary,
  removeReview,
  respondToReview,
  reviewability,
  reviewModerationQueue,
  writeReview,
} from '@/platform/reviews/service';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { addDays } from '@/lib/zoned-time';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient', name?: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: name ?? `${label} ${seq}`, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function practice(slug: string) {
  const reviewerId = await user('reviewer');
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'moderator' } });
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(organizationId, { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, latitude: 21.25, longitude: 81.63, hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAtMinutes: 540, closesAtMinutes: 1020 })) }, ownerId);
  await testDb().location.update({ where: { id: locationId }, data: { observesPublicHolidays: false, chairs: 4 } });
  const dentistUserId = await user(`dr-${slug}`, 'dentist');
  await upsertDentistProfile(dentistUserId, { slug: `dr-${slug}`, bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.', languages: ['en'], specialtyKeys: ['general_dentistry'] });
  await addQualification(dentistUserId, { degree: 'BDS', institution: 'Government Dental College', year: 2012, registrationNumber: `DCI-${slug}`, registrationBody: 'Dental Council of India' });
  const { verificationRequestId } = await submitForVerification(dentistUserId);
  await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
  const { practiceId } = await claimPractice(dentistUserId, locationId);
  await confirmPractice(practiceId, organizationId, ownerId);
  await testDb().dentistPractice.update({ where: { id: practiceId }, data: { autoConfirm: true, minNoticeMinutes: 60 } });
  const profile = await testDb().dentistProfile.findUniqueOrThrow({ where: { userId: dentistUserId } });
  return { organizationId, ownerId, practiceId, dentistUserId, profileId: profile.id, admin: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]), dentist: principal(dentistUserId, ['dentist']) };
}

let slot = 0;
/** A real booking, then marked completed (the practice-side lifecycle has its own tests). */
async function completedVisit(p: Awaited<ReturnType<typeof practice>>, patient: AuthenticatedPrincipal, completedDaysAgo = 1) {
  const date = addDays(localDateOf(new Date(), TZ), 1);
  const { slots } = await availableSlots({ practiceId: p.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
  const { appointment } = await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[slot++ % slots.length]!.startsAt });
  await testDb().appointment.update({ where: { id: appointment.id }, data: { status: 'COMPLETED', completedAt: new Date(Date.now() - completedDaysAgo * DAY) } });
  return appointment.id;
}

describeIntegration('Reviews', () => {
  let moderator: AuthenticatedPrincipal;

  beforeAll(async () => {
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
  });
  afterAll(async () => {
    resetPlatformSubscribers();
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    slot = 0;
    const m = await user('moderator');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: m, roleKey: 'moderator' } });
    moderator = principal(m, ['moderator']);
  });

  it('accepts one review from the patient of a completed visit, within 90 days, without contact details', async () => {
    const p = await practice('rv1');
    const patient = principal(await user('patient', 'patient', 'Priya Sharma'), ['patient']);
    const stranger = principal(await user('stranger'), ['patient']);

    const date = addDays(localDateOf(new Date(), TZ), 1);
    const { slots } = await availableSlots({ practiceId: p.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
    const { appointment: upcoming } = await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[5]!.startsAt });
    await expect(writeReview(patient, upcoming.id, { rating: 5 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const visit = await completedVisit(p, patient);
    await expect(writeReview(stranger, visit, { rating: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(writeReview(patient, visit, { rating: 6 })).rejects.toThrow();
    await expect(writeReview(patient, visit, { rating: 5, body: 'Lovely, call her on 98270 12345' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const { reviewId } = await writeReview(patient, visit, { rating: 5, body: 'Painless root canal, explained every step.' });
    await expect(writeReview(patient, visit, { rating: 4 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await reviewability(patient, visit)).reason).toBe('REVIEWED');
    const row = await testDb().review.findUniqueOrThrow({ where: { id: reviewId } });
    expect(row).toMatchObject({ dentistProfileId: p.profileId, organizationId: p.organizationId, rating: 5, status: 'PUBLISHED' });
    expect(await testDb().inAppNotification.count({ where: { userId: p.ownerId, notificationId: 'TL-NOTIF-REVIEW-RECEIVED-001' } })).toBe(1);
    expect(await testDb().inAppNotification.count({ where: { userId: p.dentistUserId, notificationId: 'TL-NOTIF-REVIEW-RECEIVED-001' } })).toBe(1);

    const old = await completedVisit(p, patient, 100);
    await expect(writeReview(patient, old, { rating: 3 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const [shown] = await listPublicReviews({ dentistProfileId: p.profileId });
    expect(shown).toMatchObject({ reviewer: 'Priya S.', rating: 5 });
    expect(publicName('Arjun')).toBe('Arjun');
    expect(publicName(null)).toBe('A patient');
    await expect(testDb().review.update({ where: { id: reviewId }, data: { rating: 7 } })).rejects.toThrow();
  });

  it('lets the patient edit for 30 days and remove, and counts only published reviews, with an average from three', async () => {
    const p = await practice('rv2');
    const patients = await Promise.all(['a', 'b', 'c'].map(async (l) => principal(await user(`p-${l}`), ['patient'])));
    const ids: string[] = [];
    for (const [i, pt] of patients.entries()) ids.push((await writeReview(pt, await completedVisit(p, pt), { rating: [5, 4, 3][i]! })).reviewId);

    let summary = await ratingSummary({ dentistProfileId: p.profileId });
    expect(summary).toMatchObject({ count: 3, average: 4, distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } });

    await expect(editReview(patients[1]!, ids[0]!, { rating: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await editReview(patients[2]!, ids[2]!, { rating: 4, body: 'Better on the follow-up.' });
    await expect(editReview(patients[2]!, ids[2]!, { rating: 5 }, { now: new Date(Date.now() + 31 * DAY) })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await removeReview(patients[0]!, ids[0]!);
    expect(await testDb().review.findUniqueOrThrow({ where: { id: ids[0]! } })).toMatchObject({ status: 'REMOVED', body: null });
    await expect(removeReview(patients[0]!, ids[0]!)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    summary = await ratingSummary({ dentistProfileId: p.profileId });
    expect(summary).toMatchObject({ count: 2, average: null });
    expect(await listPublicReviews({ organizationId: p.organizationId })).toHaveLength(2);
  });

  it('lets the practice or treating dentist reply once and flag, and only moderators hide, with a reason', async () => {
    const p = await practice('rv3');
    const other = await practice('rv3-other');
    const patient = principal(await user('patient'), ['patient']);
    const { reviewId } = await writeReview(patient, await completedVisit(p, patient), { rating: 2, body: 'Waited forty minutes past my time.' });

    await expect(respondToReview(other.admin, reviewId, { body: 'We are sorry to hear that.' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(respondToReview(patient, reviewId, { body: 'Replying to myself here.' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await respondToReview(p.admin, reviewId, { body: 'We are sorry — a surgery overran that morning. We now text patients when we run late.' });
    await respondToReview(p.dentist, reviewId, { body: 'I am sorry for the wait; it should not happen again.' });
    expect((await testDb().reviewResponse.findUniqueOrThrow({ where: { reviewId } })).authorUserId).toBe(p.dentistUserId);
    expect(await testDb().inAppNotification.count({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-REVIEW-RESPONSE-001' } })).toBe(1);
    expect((await practiceReviews(p.admin)).map((r) => r.id)).toEqual([reviewId]);
    expect(await practiceReviews(other.admin)).toHaveLength(0);

    await expect(flagReview(other.admin, reviewId, { reason: 'This is not even our clinic at all.' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await flagReview(p.admin, reviewId, { reason: 'Mentions a staff member by full name.' });
    await expect(flagReview(p.dentist, reviewId, { reason: 'Flagging it once more, please.' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await listPublicReviews({ dentistProfileId: p.profileId })).map((r) => r.id)).toEqual([reviewId]);

    await expect(moderateReview(p.admin, reviewId, { action: 'HIDE', reason: 'Not nice' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(reviewModerationQueue(p.admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await reviewModerationQueue(moderator)).map((r) => r.id)).toEqual([reviewId]);
    await moderateReview(moderator, reviewId, { action: 'KEEP' });
    expect((await testDb().review.findUniqueOrThrow({ where: { id: reviewId } })).flaggedAt).toBeNull();
    await expect(moderateReview(moderator, reviewId, { action: 'HIDE' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await moderateReview(moderator, reviewId, { action: 'HIDE', reason: 'Names a staff member.' });
    expect(await listPublicReviews({ dentistProfileId: p.profileId })).toHaveLength(0);
    expect(await testDb().inAppNotification.count({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-REVIEW-MODERATION-001' } })).toBe(1);
    await expect(respondToReview(p.admin, reviewId, { body: 'Replying to a hidden review.' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await moderateReview(moderator, reviewId, { action: 'RESTORE' });
    expect(await listPublicReviews({ dentistProfileId: p.profileId })).toHaveLength(1);
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'REVIEW_' } } })).toBe(7);
  });
});
