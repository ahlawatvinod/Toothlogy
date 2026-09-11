/**
 * TL-TEST-EDUCATION-001 — colleges, courses, admission windows and enquiries.
 *
 * Colleges only; MDS needs a listed specialty; recognition checked only by
 * staff and cleared when the claim changes; windows validated and one per
 * year; public pages show published courses of claimed colleges only.
 * Enquiries: verified email, consent, published course, never at one's own
 * college, one open per course, notified both ways; transitions, assignment
 * and withdrawal by the right people only; numbers; tenant isolation.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { admissionsToday, collegeConsole, createCourse, cycleState, decideRecognition, getPublicCollege, listPublicColleges, updateCourse, upsertAdmissionCycle, upsertCollegeProfile } from '@/platform/education/colleges';
import { actOnEnquiry, createEnquiry, enquiryStats, listEnquiries, myEnquiries } from '@/platform/education/enquiries';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, verified = true) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  if (verified) await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function college(slug: string, type: 'COLLEGE' | 'CLINIC' = 'COLLEGE') {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `${type === 'COLLEGE' ? 'College' : 'Clinic'} ${slug}`, slug, type, countryCode: 'IN', timezone: TZ }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    ownerId,
    staffId,
    admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

const iso = (offsetDays: number) => admissionsToday(new Date(Date.now() + offsetDays * DAY));

async function publishedBds(c: Awaited<ReturnType<typeof college>>) {
  const { courseId } = await createCourse(c.admin, c.organizationId, { level: 'BDS', name: 'Bachelor of Dental Surgery', durationMonths: 60, seats: 100, annualFeeMinor: '45000000', entranceExam: 'NEET_UG' });
  await updateCourse(c.admin, courseId, { status: 'PUBLISHED' });
  return courseId;
}

describeIntegration('Education', () => {
  let staffReviewer: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;

  beforeAll(async () => {
    await assertSeeded();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    const reviewerId = await user('reviewer');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'platform_admin' } });
    staffReviewer = principal(reviewerId, ['platform_admin']);
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('keeps courses to colleges and their administrators, requires a listed specialty for MDS, and stores fees in paise', async () => {
    const c = await college('gdc');
    const clinic = await college('smile', 'CLINIC');
    const bds = { level: 'BDS' as const, name: 'Bachelor of Dental Surgery', durationMonths: 60, entranceExam: 'NEET_UG' as const };

    await expect(createCourse(clinic.admin, clinic.organizationId, bds)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(createCourse(outsider, c.organizationId, bds)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createCourse(c.staff, c.organizationId, bds)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createCourse(c.admin, c.organizationId, { level: 'MDS', name: 'MDS Orthodontics', durationMonths: 36, entranceExam: 'NEET_MDS' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createCourse(c.admin, c.organizationId, { level: 'MDS', specialtyKey: 'astrology', name: 'MDS Stars', durationMonths: 36, entranceExam: 'NEET_MDS' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const first = await createCourse(c.admin, c.organizationId, { ...bds, annualFeeMinor: '45000000', seats: 100 });
    const second = await createCourse(c.admin, c.organizationId, bds);
    expect(second.slug).toBe(`${first.slug}-2`);
    await createCourse(c.admin, c.organizationId, { level: 'MDS', specialtyKey: 'orthodontics', name: 'MDS Orthodontics', durationMonths: 36, entranceExam: 'NEET_MDS' });
    const console_ = await collegeConsole(c.admin, c.organizationId);
    expect(console_.courses).toHaveLength(3);
    const stored = await testDb().course.findUniqueOrThrow({ where: { id: first.courseId } });
    expect(stored).toMatchObject({ annualFeeMinor: BigInt(45_000_000), currency: 'INR', status: 'DRAFT' });
    // The database refuses nonsense even past the service.
    await expect(testDb().course.update({ where: { id: first.courseId }, data: { durationMonths: 0 } })).rejects.toThrow();
  });

  it('lets only staff check stated recognition, and clears the check when the college changes what it states', async () => {
    const c = await college('rec');
    await expect(decideRecognition(staffReviewer, c.organizationId, { decision: 'VERIFY' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await upsertCollegeProfile(c.admin, c.organizationId, { ownership: 'GOVERNMENT', affiliatedUniversity: 'Pt. Ravishankar Shukla University', establishedYear: 2003 });
    await expect(decideRecognition(staffReviewer, c.organizationId, { decision: 'VERIFY' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await upsertCollegeProfile(c.admin, c.organizationId, { recognitionBody: 'Dental Council of India', recognitionReference: 'DE-4(12)/2003' });
    await expect(decideRecognition(c.admin, c.organizationId, { decision: 'VERIFY' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await decideRecognition(staffReviewer, c.organizationId, { decision: 'VERIFY', note: 'On DCI list 2026' });
    expect((await testDb().collegeProfile.findUniqueOrThrow({ where: { organizationId: c.organizationId } })).recognitionVerifiedAt).not.toBeNull();

    // Same values again: the check stands. A changed reference: it is cleared.
    await upsertCollegeProfile(c.admin, c.organizationId, { recognitionBody: 'Dental Council of India', recognitionReference: 'DE-4(12)/2003' });
    expect((await testDb().collegeProfile.findUniqueOrThrow({ where: { organizationId: c.organizationId } })).recognitionVerifiedAt).not.toBeNull();
    await upsertCollegeProfile(c.admin, c.organizationId, { recognitionReference: 'DE-9(99)/2020' });
    expect((await testDb().collegeProfile.findUniqueOrThrow({ where: { organizationId: c.organizationId } })).recognitionVerifiedAt).toBeNull();
    await expect(upsertCollegeProfile(c.admin, c.organizationId, { establishedYear: new Date().getFullYear() + 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await testDb().auditEvent.count({ where: { action: 'COLLEGE_RECOGNITION_VERIFIED', subject: c.organizationId } })).toBe(1);
  });

  it('validates admission windows, keeps one per academic year, and says whether each is open', async () => {
    const c = await college('win');
    const courseId = await publishedBds(c);
    await expect(upsertAdmissionCycle(c.admin, courseId, { academicYear: '2026-28', opensOn: iso(0), closesOn: iso(10) })).rejects.toThrow();
    await expect(upsertAdmissionCycle(c.admin, courseId, { academicYear: '2026-27', opensOn: iso(10), closesOn: iso(0) })).rejects.toThrow();
    await expect(upsertAdmissionCycle(outsider, courseId, { academicYear: '2026-27', opensOn: iso(0), closesOn: iso(10) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await upsertAdmissionCycle(c.admin, courseId, { academicYear: '2026-27', opensOn: iso(-10), closesOn: iso(5), seats: 90 });
    const cycle = await upsertAdmissionCycle(c.admin, courseId, { academicYear: '2026-27', opensOn: iso(-10), closesOn: iso(30), seats: 100 });
    expect(await testDb().admissionCycle.count({ where: { courseId } })).toBe(1);
    expect(cycle.seats).toBe(100);
    const today = admissionsToday();
    expect(cycleState(cycle, today)).toBe('OPEN');
    expect(cycleState({ opensOn: new Date(`${iso(3)}T00:00:00Z`), closesOn: new Date(`${iso(9)}T00:00:00Z`) }, today)).toBe('UPCOMING');
    expect(cycleState({ opensOn: new Date(`${iso(-9)}T00:00:00Z`), closesOn: new Date(`${iso(-3)}T00:00:00Z`) }, today)).toBe('CLOSED');
  });

  it('shows only published courses of claimed colleges in public', async () => {
    const c = await college('pub');
    const courseId = await publishedBds(c);
    await createCourse(c.admin, c.organizationId, { level: 'MDS', specialtyKey: 'periodontics', name: 'MDS Periodontics', durationMonths: 36, entranceExam: 'NEET_MDS' }); // draft
    const page = await getPublicCollege('pub');
    expect(page?.courses.map((k) => k.id)).toEqual([courseId]);
    expect(page).toMatchObject({ isClaimed: true, recognitionVerified: false });
    expect((await listPublicColleges({})).map((x) => x.slug)).toEqual(['pub']);
    expect(await listPublicColleges({ level: 'MDS' })).toHaveLength(0);

    // Unclaimed: listed page, no courses, not in the directory.
    await testDb().organization.update({ where: { id: c.organizationId }, data: { ownerUserId: null } });
    expect((await getPublicCollege('pub'))?.courses).toEqual([]);
    expect(await listPublicColleges({})).toHaveLength(0);
    expect(await getPublicCollege('nope')).toBeNull();
  });

  it('takes enquiries only from verified students with consent, one open per course, never from the college’s own people', async () => {
    const c = await college('enq');
    const courseId = await publishedBds(c);
    await upsertAdmissionCycle(c.admin, courseId, { academicYear: '2025-26', opensOn: iso(-400), closesOn: iso(-300) });
    const open = await upsertAdmissionCycle(c.admin, courseId, { academicYear: '2026-27', opensOn: iso(-10), closesOn: iso(30) });
    const draft = await createCourse(c.admin, c.organizationId, { level: 'CERTIFICATE', name: 'Certificate in Dental Assisting', durationMonths: 6, entranceExam: 'NONE' });

    const unverified = principal(await user('fresh', false), ['patient']);
    await expect(createEnquiry(unverified, courseId, { consentToContact: true })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const studentId = await user('student');
    const student = principal(studentId, ['patient']);
    await expect(createEnquiry(student, courseId, { consentToContact: false as true })).rejects.toThrow();
    await expect(createEnquiry(student, draft.courseId, { consentToContact: true })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createEnquiry(c.staff, courseId, { consentToContact: true })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const made = await createEnquiry(student, courseId, { consentToContact: true, qualification: 'Class XII PCB 2026', examName: 'NEET_UG', examRank: 41234, message: 'Is there a hostel?' });
    expect(made.cycle).toBe('2026-27');
    expect((await testDb().admissionEnquiry.findUniqueOrThrow({ where: { id: made.enquiryId } })).cycleId).toBe(open.id);
    await expect(createEnquiry(student, courseId, { consentToContact: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: c.ownerId, notificationId: 'TL-NOTIF-ADMISSION-ENQUIRY-001' } })).toBe(1);
    expect(await testDb().inAppNotification.count({ where: { userId: studentId } })).toBe(0);

    // The college sees it with the student's details; nobody else does.
    const [row] = await listEnquiries(c.staff, c.organizationId);
    expect(row).toMatchObject({ status: 'NEW', examRank: 41234, consentToContact: true });
    expect(row!.student.email).toContain('student-');
    const other = await college('other');
    await expect(listEnquiries(other.admin, c.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listEnquiries(outsider, c.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await myEnquiries(student)).toHaveLength(1);
    expect(await myEnquiries(outsider)).toHaveLength(0);
  });

  it('moves enquiries by the rules, tells the student, and lets them enquire again once closed', async () => {
    const c = await college('flow');
    const courseId = await publishedBds(c);
    const studentId = await user('applicant');
    const student = principal(studentId, ['patient']);
    const { enquiryId } = await createEnquiry(student, courseId, { consentToContact: true });

    await expect(actOnEnquiry(c.staff, enquiryId, { action: 'CONTACTED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnEnquiry(outsider, enquiryId, { action: 'CONTACTED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnEnquiry(student, enquiryId, { action: 'ADMITTED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnEnquiry(c.admin, enquiryId, { action: 'ADMITTED' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(actOnEnquiry(c.admin, enquiryId, { action: 'LOST' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await actOnEnquiry(c.admin, enquiryId, { action: 'ASSIGN', assigneeUserId: c.staffId });
    await expect(actOnEnquiry(c.admin, enquiryId, { action: 'ASSIGN', assigneeUserId: outsider.userId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    // The assignee takes notes and follow-ups, but decisions stay with administrators.
    await actOnEnquiry(c.staff, enquiryId, { action: 'NOTE', note: 'Called, will visit Monday' });
    await actOnEnquiry(c.staff, enquiryId, { action: 'FOLLOW_UP', at: new Date(Date.now() + 2 * DAY).toISOString() });
    await expect(actOnEnquiry(c.staff, enquiryId, { action: 'FOLLOW_UP', at: new Date(Date.now() - DAY).toISOString() })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(actOnEnquiry(c.staff, enquiryId, { action: 'APPLIED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await actOnEnquiry(c.admin, enquiryId, { action: 'CONTACTED' });
    await actOnEnquiry(c.admin, enquiryId, { action: 'APPLIED' });
    const admitted = await actOnEnquiry(c.admin, enquiryId, { action: 'ADMITTED' });
    expect(admitted.status).toBe('ADMITTED');
    const row = await testDb().admissionEnquiry.findUniqueOrThrow({ where: { id: enquiryId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    expect(row).toMatchObject({ openKey: null, nextFollowUpAt: null });
    expect(row.contactedAt && row.appliedAt && row.decidedAt).toBeTruthy();
    expect(row.events.map((e) => e.action)).toEqual(['CREATED', 'ASSIGNED', 'NOTE', 'FOLLOW_UP_SET', 'CONTACTED', 'APPLIED', 'ADMITTED']);
    expect(await testDb().inAppNotification.count({ where: { userId: studentId, notificationId: 'TL-NOTIF-ADMISSION-UPDATE-001' } })).toBe(3);
    await expect(actOnEnquiry(student, enquiryId, { action: 'WITHDRAW' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Closed, the student may ask again; then withdraw it themselves.
    const again = await createEnquiry(student, courseId, { consentToContact: true });
    const intruder = principal(await user('intruder'), ['patient']);
    await expect(actOnEnquiry(intruder, again.enquiryId, { action: 'WITHDRAW' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await actOnEnquiry(student, again.enquiryId, { action: 'WITHDRAW' });

    const stats = await enquiryStats(c.admin, c.organizationId);
    expect(stats).toMatchObject({ total: 2, open: 0, admitted: 1, admissionRate: 50 });
    expect(stats.byStatus).toMatchObject({ ADMITTED: 1, WITHDRAWN: 1 });
    // Only what succeeded is audited: 2 created, assign, note, follow-up, contacted, applied, admitted, withdraw.
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'ADMISSION_ENQUIRY_' } } })).toBe(9);
  });
});
