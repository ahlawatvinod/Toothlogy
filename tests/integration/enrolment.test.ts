/**
 * TL-TEST-ENROLMENT-001 — enrolment, the end of the admission funnel.
 *
 * Only an admitted student is enrolled, once per enquiry and once per course
 * and year; roll numbers are unique within a course and year; the academic
 * year is two consecutive years; only the college's administrators keep the
 * roll; completion and withdrawal (with a reason, never before the start)
 * end it once; the student is told and sees it.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createCourse, updateCourse } from '@/platform/education/colleges';
import { actOnEnquiry, createEnquiry } from '@/platform/education/enquiries';
import { collegeRoll, endEnrolment, enrolFromEnquiry, isAcademicYear, myEnrolments } from '@/platform/education/enrolments';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}
let seq = 0;
async function user(label: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'student', acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}
async function college(slug: string) {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `College ${slug}`, slug, type: 'COLLEGE', countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  const admin = principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]);
  const { courseId } = await createCourse(admin, organizationId, { level: 'BDS', name: 'Bachelor of Dental Surgery', durationMonths: 60, seats: 100, annualFeeMinor: '45000000', entranceExam: 'NEET_UG' });
  await updateCourse(admin, courseId, { status: 'PUBLISHED' });
  return { organizationId, courseId, admin, staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]) };
}
async function admitted(c: Awaited<ReturnType<typeof college>>, label: string) {
  const student = principal(await user(label), ['student']);
  const { enquiryId } = await createEnquiry(student, c.courseId, { consentToContact: true, qualification: '12th, PCB' });
  await actOnEnquiry(c.admin, enquiryId, { action: 'APPLIED' });
  return { student, enquiryId };
}
const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Enrolment', () => {
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

  it('enrols only admitted students, once, with unique roll numbers', async () => {
    const c = await college('enrol-a');
    const other = await college('enrol-b');
    const a = await admitted(c, 'asha');
    expect(await code(enrolFromEnquiry(c.admin, a.enquiryId, { academicYear: '2026-27', startedOn: '2026-08-01' }))).toBe('PRECONDITION_FAILED'); // applied, not admitted
    await actOnEnquiry(c.admin, a.enquiryId, { action: 'ADMITTED' });
    expect(await code(enrolFromEnquiry(c.staff, a.enquiryId, { academicYear: '2026-27', startedOn: '2026-08-01' }))).toBe('NOT_FOUND');
    expect(await code(enrolFromEnquiry(other.admin, a.enquiryId, { academicYear: '2026-27', startedOn: '2026-08-01' }))).toBe('NOT_FOUND');
    expect(await code(enrolFromEnquiry(c.admin, a.enquiryId, { academicYear: '2026-28', startedOn: '2026-08-01' }))).toBe('VALIDATION_FAILED');
    const { enrolmentId } = await enrolFromEnquiry(c.admin, a.enquiryId, { academicYear: '2026-27', rollNumber: 'BDS-26-001', startedOn: '2026-08-01' });
    expect(await code(enrolFromEnquiry(c.admin, a.enquiryId, { academicYear: '2026-27', startedOn: '2026-08-01' }))).toBe('CONFLICT');

    const b = await admitted(c, 'bala');
    await actOnEnquiry(c.admin, b.enquiryId, { action: 'ADMITTED' });
    expect(await code(enrolFromEnquiry(c.admin, b.enquiryId, { academicYear: '2026-27', rollNumber: 'BDS-26-001', startedOn: '2026-08-01' }))).toBe('CONFLICT');
    await enrolFromEnquiry(c.admin, b.enquiryId, { academicYear: '2026-27', rollNumber: 'BDS-26-002', startedOn: '2026-08-01' });

    const told = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: a.student.userId, notificationId: 'TL-NOTIF-ENROLMENT-001' } });
    expect(told.body).toContain('you are enrolled for 2026-27');
    expect((await myEnrolments(a.student)).map((e) => e.id)).toEqual([enrolmentId]);
    const roll = await collegeRoll(c.admin, c.organizationId, { academicYear: '2026-27' });
    expect(roll.enrolments.map((e) => e.rollNumber)).toEqual(['BDS-26-001', 'BDS-26-002']);
    expect(roll.years).toEqual(['2026-27']);
    expect(await code(collegeRoll(c.staff, c.organizationId))).toBe('NOT_FOUND');
  });

  it('ends an enrolment once — completed, or withdrawn with a reason — and tells the student', async () => {
    const c = await college('enrol-c');
    const a = await admitted(c, 'chitra');
    await actOnEnquiry(c.admin, a.enquiryId, { action: 'ADMITTED' });
    const { enrolmentId } = await enrolFromEnquiry(c.admin, a.enquiryId, { academicYear: '2025-26', startedOn: '2025-08-01' });
    expect(await code(endEnrolment(c.admin, enrolmentId, { status: 'WITHDRAWN', endedOn: '2026-01-10' }))).toBe('VALIDATION_FAILED');
    expect(await code(endEnrolment(c.admin, enrolmentId, { status: 'COMPLETED', endedOn: '2025-07-01' }))).toBe('VALIDATION_FAILED');
    expect(await code(endEnrolment(c.admin, enrolmentId, { status: 'COMPLETED', endedOn: '2099-01-01' }))).toBe('VALIDATION_FAILED');
    await endEnrolment(c.admin, enrolmentId, { status: 'WITHDRAWN', endedOn: '2026-01-10', reason: 'Moved to another state.' });
    expect(await code(endEnrolment(c.admin, enrolmentId, { status: 'COMPLETED', endedOn: '2026-01-11' }))).toBe('CONFLICT');
    expect((await myEnrolments(a.student))[0]).toMatchObject({ status: 'WITHDRAWN' });
    const last = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: a.student.userId, notificationId: 'TL-NOTIF-ENROLMENT-001' }, orderBy: { createdAt: 'desc' } });
    expect(last.body).toContain('recorded as withdrawn');
    expect((await collegeRoll(c.admin, c.organizationId, { status: 'ENROLLED' })).enrolments).toHaveLength(0);
  });

  it('knows an academic year when it sees one', () => {
    expect(isAcademicYear('2026-27')).toBe(true);
    expect(isAcademicYear('2099-00')).toBe(true);
    for (const bad of ['2026-28', '2026', '26-27', '2026-2027', 'abcd-ef']) expect(isAcademicYear(bad)).toBe(false);
  });
});
