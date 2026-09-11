/**
 * TL-TEST-CAMPS-001 — district dental camps against the real database.
 *
 * Lifecycle and review (never one's own), doctors' applications and
 * attendance, patient registration with capacity under concurrency and one
 * per phone and account, walk-ins, visits and referrals, and camp
 * attribution of real callback leads and bookings; completion, console
 * numbers, participation history, notifications, access.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import { requestCallback } from '@/platform/leads/service';
import { matchDistrict } from '@/platform/india-data/districts';
import {
  actOnCamp,
  actOnCampDoctor,
  applyToCamp,
  campConsole,
  campReferralFor,
  cancelRegistration,
  createCamp,
  getPublicCamp,
  listPublicCamps,
  myCamps,
  recordVisit,
  registerForCamp,
  registerWalkIn,
  updateCamp,
} from '@/platform/camps/service';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { addDays } from '@/lib/zoned-time';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

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

/** A verified, discoverable dentist with a confirmed, bookable practice. */
async function verifiedDentist(slug: string) {
  const reviewerId = await user('reviewer');
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'moderator' } });
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(
    organizationId,
    { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, latitude: 21.25, longitude: 81.63, hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAtMinutes: 540, closesAtMinutes: 1020 })) },
    ownerId,
  );
  await testDb().location.update({ where: { id: locationId }, data: { observesPublicHolidays: false, chairs: 2 } });
  const dentistUserId = await user(`dr-${slug}`, 'dentist');
  await upsertDentistProfile(dentistUserId, { slug: `dr-${slug}`, bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.', languages: ['en', 'hi'], specialtyKeys: ['general_dentistry'] });
  await addQualification(dentistUserId, { degree: 'BDS', institution: 'Government Dental College', year: 2012, registrationNumber: `DCI-${slug}`, registrationBody: 'Dental Council of India' });
  const { verificationRequestId } = await submitForVerification(dentistUserId);
  await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
  const { practiceId } = await claimPractice(dentistUserId, locationId);
  await confirmPractice(practiceId, organizationId, ownerId);
  await testDb().dentistPractice.update({ where: { id: practiceId }, data: { autoConfirm: true, minNoticeMinutes: 60 } });
  const profile = await testDb().dentistProfile.update({ where: { userId: dentistUserId }, data: { isDiscoverable: true } });
  return { userId: dentistUserId, profileId: profile.id, practiceId, organizationId, ownerId, me: principal(dentistUserId, ['dentist']) };
}

describeIntegration('Dental camps', () => {
  let raipurId: string;
  let staff: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;

  beforeAll(async () => {
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
    raipurId = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!.id;
  });
  afterAll(async () => {
    resetPlatformSubscribers();
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    const staffId = await user('camp-staff');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: staffId, roleKey: 'platform_admin' } });
    staff = principal(staffId, ['platform_admin']);
    outsider = principal(await user('outsider'), ['patient']);
  });

  const plan = (overrides: Record<string, unknown> = {}, start = Date.now() + 2 * DAY) => ({
    title: 'Free dental check-up, Tatibandh',
    districtId: raipurId,
    venueName: 'Govt. Higher Secondary School',
    venueAddress: 'Tatibandh, Raipur',
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 4 * HOUR).toISOString(),
    ...overrides,
  });

  /** A camp approved by staff; `start` may lie in the past, planned `before` it. */
  async function approvedCamp(organizer: AuthenticatedPrincipal, overrides: Record<string, unknown> = {}, start = Date.now() + 2 * DAY) {
    const before = new Date(start - DAY);
    const { campId, slug } = await createCamp(organizer, plan(overrides, start), { now: before });
    await actOnCamp(organizer, campId, { action: 'SUBMIT' }, { now: before });
    await actOnCamp(staff, campId, { action: 'APPROVE' }, { now: before });
    return { campId, slug, before };
  }

  it('keeps a camp private until staff approve it, and nobody reviews their own', async () => {
    const organizer = await verifiedDentist('org1');
    await expect(createCamp(outsider, plan())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createCamp(organizer.me, plan({ endsAt: new Date(Date.now() + DAY).toISOString() }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createCamp(organizer.me, plan({}, Date.now() - HOUR))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createCamp(organizer.me, plan({ endsAt: new Date(Date.now() + 6 * DAY).toISOString() }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createCamp(organizer.me, plan({ districtId: 'dst_nope' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createCamp(organizer.me, plan({ organizationId: organizer.organizationId }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const { campId, slug } = await createCamp(organizer.me, plan({ capacity: 50 }));
    expect(slug).toContain('raipur');
    expect(await getPublicCamp(slug)).toBeNull();
    await expect(actOnCamp(outsider, campId, { action: 'SUBMIT' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await actOnCamp(organizer.me, campId, { action: 'SUBMIT' });
    await expect(actOnCamp(organizer.me, campId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnCamp(staff, campId, { action: 'REJECT' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnCamp(staff, campId, { action: 'REJECT', note: 'Add the school’s permission letter.' });
    await updateCamp(organizer.me, campId, { venueName: 'Govt. HSS Tatibandh (hall)' });
    await actOnCamp(organizer.me, campId, { action: 'SUBMIT' });
    await actOnCamp(staff, campId, { action: 'APPROVE' });
    expect((await listPublicCamps()).map((c) => c.id)).toEqual([campId]);
    expect((await getPublicCamp(slug))?.seatsLeft).toBe(50);
    expect(await testDb().inAppNotification.count({ where: { userId: organizer.userId, notificationId: 'TL-NOTIF-CAMP-REVIEW-001' } })).toBe(2);
    await expect(updateCamp(organizer.me, campId, { title: 'Changed after approval' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Staff organizing their own camp still need another reviewer.
    const own = await createCamp(staff, plan({ title: 'Staff camp at the mandi' }));
    await actOnCamp(staff, own.campId, { action: 'SUBMIT' });
    await expect(actOnCamp(staff, own.campId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Cancelling an approved camp needs a reason, and tells the registered patients.
    const patient = principal(await user('patient'), ['patient']);
    await registerForCamp(patient, campId, { phone: '9827011111', consentToShare: true });
    await expect(actOnCamp(organizer.me, campId, { action: 'CANCEL' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnCamp(organizer.me, campId, { action: 'CANCEL', note: 'School closed for elections.' });
    expect(await testDb().inAppNotification.count({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-CAMP-UPDATE-001' } })).toBe(2);
    expect(await listPublicCamps()).toHaveLength(0);
  });

  it('takes applications from verified dentists only, decided by the organizer', async () => {
    const organizer = await verifiedDentist('org2');
    const doctor = await verifiedDentist('doc2');
    const unverifiedId = await user('unverified', 'dentist');
    await upsertDentistProfile(unverifiedId, { slug: 'dr-unverified', bio: 'A dentist who has not completed verification yet, for the purposes of this test only.', languages: ['en'], specialtyKeys: ['general_dentistry'] });

    const draft = await createCamp(organizer.me, plan());
    await expect(applyToCamp(doctor.me, draft.campId, {})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const { campId } = await approvedCamp(organizer.me, { title: 'Camp at Mowa' });
    await expect(applyToCamp(principal(unverifiedId, ['dentist']), campId, {})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(applyToCamp(outsider, campId, {})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const { campDoctorId } = await applyToCamp(doctor.me, campId, { message: 'Free on Sundays' });
    await expect(applyToCamp(doctor.me, campId, {})).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: organizer.userId, notificationId: 'TL-NOTIF-CAMP-APPLICATION-001' } })).toBe(1);

    await expect(actOnCampDoctor(doctor.me, campDoctorId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnCampDoctor(outsider, campDoctorId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await actOnCampDoctor(organizer.me, campDoctorId, { action: 'APPROVE' });
    expect(await testDb().inAppNotification.count({ where: { userId: doctor.userId, notificationId: 'TL-NOTIF-CAMP-PARTICIPATION-001' } })).toBe(1);
    await expect(actOnCampDoctor(organizer.me, campDoctorId, { action: 'ATTENDED' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Withdraw and apply again; once declined, not again.
    await actOnCampDoctor(doctor.me, campDoctorId, { action: 'WITHDRAW' });
    await applyToCamp(doctor.me, campId, {});
    await actOnCampDoctor(organizer.me, campDoctorId, { action: 'DECLINE', note: 'Enough doctors' });
    await expect(applyToCamp(doctor.me, campId, {})).rejects.toMatchObject({ code: 'CONFLICT' });
    const history = await myCamps(doctor.me);
    expect(history.serving.map((s) => [s.status, s.decisionNote])).toEqual([['DECLINED', 'Enough doctors']]);
  });

  it('registers each phone and account once, gives the last place once, and records walk-ins', async () => {
    const organizer = await verifiedDentist('org3');
    const { campId } = await approvedCamp(organizer.me, { capacity: 2 });
    const a = principal(await user('pa'), ['patient']);
    const b = principal(await user('pb'), ['patient']);
    const c = principal(await user('pc'), ['patient']);

    await expect(registerForCamp(a, campId, { phone: '12345', consentToShare: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(registerForCamp(a, campId, { phone: '9827000001', consentToShare: false as true })).rejects.toThrow();
    const { registrationId } = await registerForCamp(a, campId, { phone: '098270 00001', consentToShare: true, age: 34, concern: 'Bleeding gums' });
    await expect(registerForCamp(a, campId, { phone: '9827000009', consentToShare: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(registerForCamp(b, campId, { phone: '+91 98270 00001', consentToShare: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    await registerForCamp(b, campId, { phone: '9827000002', consentToShare: true });
    await expect(registerForCamp(c, campId, { phone: '9827000003', consentToShare: true })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await expect(cancelRegistration(b, registrationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await cancelRegistration(a, registrationId);
    await registerForCamp(c, campId, { phone: '9827000003', consentToShare: true });

    // Two people racing for one last place: one gets it.
    const tight = await approvedCamp(organizer.me, { title: 'One seat camp', capacity: 1 });
    const racers = await Promise.all([user('r1'), user('r2')]);
    const results = await Promise.allSettled(racers.map((id, i) => registerForCamp(principal(id, ['patient']), tight.campId, { phone: `98271000${10 + i}`, consentToShare: true })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await testDb().campRegistration.count({ where: { campId: tight.campId } })).toBe(1);

    // Walk-ins: only the organizer or a camp doctor; still one per phone.
    const open = await approvedCamp(organizer.me, { title: 'Open camp' });
    await expect(registerWalkIn(outsider, open.campId, { name: 'Ramesh', phone: '9827000050', consentToShare: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await registerWalkIn(organizer.me, open.campId, { name: 'Ramesh', phone: '9827000050', consentToShare: true, age: 61 });
    await expect(registerWalkIn(organizer.me, open.campId, { name: 'Ramesh again', phone: '9827000050', consentToShare: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    const walkIn = await testDb().campRegistration.findFirstOrThrow({ where: { campId: open.campId } });
    expect(walkIn).toMatchObject({ source: 'WALK_IN', patientUserId: null, phone: '+919827000050', consentToShare: true });
  });

  it('records visits and referrals, attributes the follow-up callback and booking to the camp, and completes', async () => {
    const organizer = await verifiedDentist('org4');
    const doctor = await verifiedDentist('doc4');
    const bystander = await verifiedDentist('other4');
    // A camp that started two hours ago, planned and approved beforehand.
    const start = Date.now() - 2 * HOUR;
    const { campId, before } = await approvedCamp(organizer.me, { title: 'Camp at Abhanpur' }, start);
    const { campDoctorId } = await applyToCamp(doctor.me, campId, {}, { now: before });
    await actOnCampDoctor(organizer.me, campDoctorId, { action: 'APPROVE' }, { now: before });
    const patient = principal(await user('camp-patient'), ['patient']);
    const absent = principal(await user('absent'), ['patient']);
    const { registrationId } = await registerForCamp(patient, campId, { phone: '9827022222', consentToShare: true }, { now: before });
    await registerForCamp(absent, campId, { phone: '9827033333', consentToShare: true }, { now: before });

    await expect(recordVisit(doctor.me, registrationId, { needsFollowUp: false }, { now: before })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(recordVisit(outsider, registrationId, { needsFollowUp: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordVisit(bystander.me, registrationId, { needsFollowUp: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordVisit(doctor.me, registrationId, { needsFollowUp: true, referredDentistProfileId: bystander.profileId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordVisit(doctor.me, registrationId, { needsFollowUp: false, referredDentistProfileId: doctor.profileId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await recordVisit(doctor.me, registrationId, { findings: 'Caries in 36, 46; needs fillings', needsFollowUp: true, referredDentistProfileId: doctor.profileId });
    const visited = await testDb().campRegistration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(visited).toMatchObject({ status: 'ATTENDED', seenByDentistProfileId: doctor.profileId, referredDentistProfileId: doctor.profileId });
    expect(await testDb().inAppNotification.count({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-CAMP-UPDATE-001' } })).toBe(2);

    // Follow-up through the ordinary flows, attributed to the visit.
    expect(await campReferralFor(patient.userId, doctor.profileId)).toBe(registrationId);
    expect(await campReferralFor(patient.userId, bystander.profileId)).toBeNull();
    const callback = await requestCallback(patient, { practiceId: doctor.practiceId, note: 'After the camp' });
    expect((await testDb().lead.findUniqueOrThrow({ where: { id: callback.id } })).campRegistrationId).toBe(registrationId);
    const date = addDays(localDateOf(new Date(), TZ), 1);
    const { slots } = await availableSlots({ practiceId: doctor.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
    const { appointment } = await bookAppointment(patient, { practiceId: doctor.practiceId, startsAt: slots[0]!.startsAt });
    expect(appointment.campRegistrationId).toBe(registrationId);
    expect((await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } })).campRegistrationId).toBe(registrationId);
    // Someone not referred at the camp: no attribution.
    const { appointment: plain } = await bookAppointment(absent, { practiceId: doctor.practiceId, startsAt: slots[1]!.startsAt });
    expect(plain.campRegistrationId).toBeNull();

    // Attendance, completion, numbers, history.
    await actOnCampDoctor(organizer.me, campDoctorId, { action: 'ATTENDED' });
    await expect(campConsole(outsider, campId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await campConsole(doctor.me, campId)).viewer.doctorProfileId).toBe(doctor.profileId);
    await actOnCamp(organizer.me, campId, { action: 'COMPLETE' });
    const view = await campConsole(organizer.me, campId);
    expect(view.stats).toMatchObject({ attended: 1, noShow: 1, followUps: 1, referrals: 1, leads: 2, appointments: 1 });
    const doctorHistory = await myCamps(doctor.me);
    expect(doctorHistory.serving[0]).toMatchObject({ status: 'APPROVED', attended: true });
    const patientHistory = await myCamps(patient);
    expect(patientHistory.registrations[0]!.referredDentist?.id).toBe(doctor.profileId);
    expect(await testDb().auditEvent.count({ where: { action: { in: ['CAMP_CREATED', 'CAMP_SUBMIT', 'CAMP_APPROVE', 'CAMP_VISIT_RECORDED', 'CAMP_COMPLETE'] }, subject: { in: [campId, registrationId] } } })).toBe(5);
  });
});
