/**
 * TL-TEST-ANALYTICS-001 — dashboards from what actually happened.
 *
 * A practice's numbers match its records — bookings, outcomes and the
 * attended rate, leads, reviews, views, services, the per-day series — and
 * nothing from another practice leaks in; front-desk staff and other
 * practices get not-found. Views are anonymous without analytics consent.
 * Platform totals need the operator permission.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import { consentedActor, trackView } from '@/platform/analytics/events';
import { dentistAnalytics, fillDays, platformAnalytics, practiceAnalytics } from '@/platform/analytics/dashboards';
import { setConsent } from '@/platform/users/preferences';
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
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role, acceptedTerms: true });
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
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  const dentistProfileId = (await testDb().dentistPractice.findUniqueOrThrow({ where: { id: practiceId }, select: { dentistProfileId: true } })).dentistProfileId;
  return {
    organizationId,
    practiceId,
    dentistProfileId,
    admin: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

let slot = 0;
async function book(p: Awaited<ReturnType<typeof practice>>, patient: AuthenticatedPrincipal) {
  const date = addDays(localDateOf(new Date(), TZ), 1);
  const { slots } = await availableSlots({ practiceId: p.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
  const { appointment } = await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[slot++ % slots.length]!.startsAt });
  return appointment.id;
}

/** Move a booked appointment into the past with an outcome (the lifecycle has its own tests). */
async function happened(appointmentId: string, status: 'COMPLETED' | 'NO_SHOW', hoursAgo: number) {
  const startsAt = new Date(Date.now() - hoursAgo * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  await testDb().appointment.update({ where: { id: appointmentId }, data: { startsAt, endsAt, occupiedUntil: endsAt, status, ...(status === 'COMPLETED' ? { completedAt: endsAt } : {}) } });
}

const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Analytics dashboards', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('counts a practice’s own records, and nobody else’s', async () => {
    const p = await practice('stats-a');
    const other = await practice('stats-b');
    const patients = await Promise.all(['ana', 'ben', 'cy'].map(async (n) => principal(await user(n), ['patient'])));
    const [a1, a2] = [await book(p, patients[0]!), await book(p, patients[1]!)];
    await book(p, patients[2]!);
    await book(other, patients[0]!);
    await happened(a1, 'COMPLETED', 50);
    await happened(a2, 'NO_SHOW', 26);
    const appt = await testDb().appointment.findUniqueOrThrow({ where: { id: a1 } });
    await testDb().review.create({ data: { id: `rev_${Math.random().toString(36).slice(2)}`, appointmentId: a1, patientUserId: appt.patientUserId, dentistProfileId: appt.dentistProfileId, organizationId: p.organizationId, rating: 4 } });

    await trackView('profile_viewed', 'dentist', p.dentistProfileId, null);
    await trackView('profile_viewed', 'dentist', p.dentistProfileId, patients[1]!.userId);
    await trackView('clinic_viewed', 'organization', p.organizationId, null);
    await trackView('profile_viewed', 'dentist', other.dentistProfileId, null);

    const d = await practiceAnalytics(p.admin, p.organizationId, 30);
    expect(d.appointments).toMatchObject({ booked: 3, completed: 1, noShow: 1, attendedRate: 0.5 });
    expect(d.leads.created).toBe(await testDb().lead.count({ where: { organizationId: p.organizationId } }));
    expect(d.reviews).toMatchObject({ inWindow: 1, total: 1, averageInWindow: 4 });
    expect(d.views).toEqual({ profile: 2, clinic: 1 });
    expect(d.topServices[0]!.count).toBe(3);
    expect(d.bookingsByDay).toHaveLength(30);
    expect(d.bookingsByDay.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(d.spendMinor).toBe(0);

    expect(await code(practiceAnalytics(p.staff, p.organizationId))).toBe('NOT_FOUND');
    expect(await code(practiceAnalytics(other.admin, p.organizationId))).toBe('NOT_FOUND');
    expect((await practiceAnalytics(other.admin, other.organizationId, 7)).appointments.booked).toBe(1);

    // The dentist's own numbers: the same bookings, review and profile views — none of the other practice's.
    const drUserId = (await testDb().dentistProfile.findUniqueOrThrow({ where: { id: p.dentistProfileId }, select: { userId: true } })).userId;
    const mine = await dentistAnalytics(principal(drUserId, ['dentist']), 30);
    expect(mine.appointments).toMatchObject({ booked: 3, completed: 1, noShow: 1, attendedRate: 0.5 });
    expect(mine.reviews).toMatchObject({ inWindow: 1, total: 1, averageInWindow: 4 });
    expect([mine.profileViews, mine.practices]).toEqual([2, 1]);
    expect(mine.bookingsByDay.reduce((s, x) => s + x.count, 0)).toBe(3);
    expect(await code(dentistAnalytics(patients[0]!, 30))).toBe('NOT_FOUND');
  });

  it('identifies a viewer only with their analytics consent, and keeps platform totals for operators', async () => {
    const viewer = await user('viewer');
    expect(await consentedActor(viewer)).toBeNull();
    await setConsent(viewer, 'ANALYTICS_TRACKING', true);
    expect(await consentedActor(viewer)).toBe(viewer);
    await setConsent(viewer, 'ANALYTICS_TRACKING', false);
    expect(await consentedActor(viewer)).toBeNull();

    const p = await practice('stats-c');
    await book(p, principal(await user('pat'), ['patient']));
    expect(await code(platformAnalytics(p.admin))).toBe('FORBIDDEN');
    const operator = principal(await user('operator'), ['platform_admin']);
    const d = await platformAnalytics(operator, 30);
    expect(d.care.appointmentsBooked).toBe(1);
    expect(d.people.new).toBe(await testDb().user.count({ where: { deletedAt: null } }));
    expect(d.trust.dentistsVerified).toBe(1);
    expect(d.signupsByDay.reduce((s, x) => s + x.count, 0)).toBe(d.people.new);
  });

  it('fills every day of the window, in India time', () => {
    const now = new Date('2026-09-11T20:00:00Z'); // 01:30 on the 12th in India
    const days = fillDays(3, now, [{ day: '2026-09-12', n: 2n }, { day: '2026-09-10', n: 1 }]);
    expect(days).toEqual([
      { day: '2026-09-10', count: 1 },
      { day: '2026-09-11', count: 0 },
      { day: '2026-09-12', count: 2 },
    ]);
    expect(new Date(now.getTime() - DAY).toISOString()).toBe('2026-09-10T20:00:00.000Z');
  });
});
