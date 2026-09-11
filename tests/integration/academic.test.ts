/**
 * TL-TEST-ACADEMIC-001 — researcher and faculty profiles, publications,
 * faculty posts confirmed by colleges.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import {
  addPublication,
  collegeFaculty,
  confirmedFaculty,
  decideFacultyAppointment,
  getPublicAcademic,
  listPublicAcademics,
  myAcademic,
  removePublication,
  requestFacultyAppointment,
  upsertAcademicProfile,
} from '@/platform/academic/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function person(label: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return principal(userId, ['patient']);
}

async function college(slug: string, claimed = true) {
  const owner = await person(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `College ${slug}`, slug, type: 'COLLEGE', countryCode: 'IN', timezone: 'Asia/Kolkata' }, owner.userId);
  if (!claimed) await testDb().organization.update({ where: { id: organizationId }, data: { ownerUserId: null } });
  return { organizationId, ownerId: owner.userId, admin: principal(owner.userId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]) };
}

describeIntegration('Researchers and faculty', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });

  it('keeps profiles private until public, checks what can be checked, and lists publications newest first', async () => {
    const asha = await person('asha');
    const other = await person('other');
    await expect(upsertAcademicProfile(asha, { type: 'RESEARCHER', displayName: 'Dr Asha Verma', interests: ['astrology'] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(upsertAcademicProfile(asha, { type: 'RESEARCHER', displayName: 'Dr Asha Verma', orcid: '1234' })).rejects.toThrow();
    const saved = await upsertAcademicProfile(asha, { type: 'RESEARCHER', displayName: 'Dr Asha Verma', slug: 'asha-verma', headline: 'Oral epidemiology', interests: ['public_health_dentistry'], orcid: '0000-0002-1825-0097' });
    expect(saved.slug).toBe('asha-verma');
    expect(await getPublicAcademic('RESEARCHER', 'asha-verma')).toBeNull(); // private by default
    await expect(upsertAcademicProfile(other, { type: 'RESEARCHER', displayName: 'Other', slug: 'asha-verma' })).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(addPublication(asha, { type: 'FACULTY', title: 'Fluoride in Raipur water', year: 2020 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(addPublication(asha, { type: 'RESEARCHER', title: 'From the future', year: new Date().getFullYear() + 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(addPublication(asha, { type: 'RESEARCHER', title: 'Bad DOI paper', year: 2020, doi: 'not-a-doi' })).rejects.toThrow();
    await addPublication(asha, { type: 'RESEARCHER', title: 'Caries in school children of Raipur', venue: 'J Indian Soc Pedod', year: 2019, doi: '10.4103/JISPPD.JISPPD_1_19' });
    const newer = await addPublication(asha, { type: 'RESEARCHER', title: 'Fluorosis mapping in Chhattisgarh', year: 2023 });
    await expect(addPublication(asha, { type: 'RESEARCHER', title: 'Same DOI again', year: 2021, doi: '10.4103/jisppd.jisppd_1_19' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(removePublication(other, newer.publicationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await upsertAcademicProfile(asha, { type: 'RESEARCHER', displayName: 'Dr Asha Verma', isPublic: true, interests: ['public_health_dentistry'] });
    const page = await getPublicAcademic('RESEARCHER', 'asha-verma');
    expect(page?.publications.map((p) => p.year)).toEqual([2023, 2019]);
    expect(page?.verifiedDentist).toBeNull();
    expect(await getPublicAcademic('FACULTY', 'asha-verma')).toBeNull();
    expect((await listPublicAcademics({ interest: 'public_health_dentistry' })).map((p) => p.slug)).toEqual(['asha-verma']);
    expect(await listPublicAcademics({ interest: 'orthodontics' })).toHaveLength(0);
    await removePublication(asha, newer.publicationId);
    expect((await getPublicAcademic('RESEARCHER', 'asha-verma'))?.publications).toHaveLength(1);
  });

  it('shows a faculty post only once the college confirms it, and lets either side end it', async () => {
    const gdc = await college('gdc-raipur');
    const unclaimed = await college('unclaimed-college', false);
    const clinicOwner = await person('clinic-owner');
    const { organizationId: clinicId } = await createOrganization({ name: 'Smile Clinic', slug: 'smile-clinic', type: 'CLINIC', countryCode: 'IN', timezone: 'Asia/Kolkata' }, clinicOwner.userId);
    const ravi = await person('ravi');
    const outsider = await person('outsider');

    await expect(requestFacultyAppointment(ravi, { organizationId: gdc.organizationId, designation: 'Reader' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await upsertAcademicProfile(ravi, { type: 'FACULTY', displayName: 'Dr Ravi Sahu', slug: 'ravi-sahu', isPublic: true });
    await expect(requestFacultyAppointment(ravi, { organizationId: clinicId, designation: 'Reader' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(requestFacultyAppointment(ravi, { organizationId: unclaimed.organizationId, designation: 'Reader' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const { appointmentId } = await requestFacultyAppointment(ravi, { organizationId: gdc.organizationId, designation: 'Reader', department: 'Orthodontics' });
    await expect(requestFacultyAppointment(ravi, { organizationId: gdc.organizationId, designation: 'Reader' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: gdc.ownerId, notificationId: 'TL-NOTIF-FACULTY-REQUEST-001' } })).toBe(1);
    expect((await getPublicAcademic('FACULTY', 'ravi-sahu'))?.facultyAppointments).toHaveLength(0);
    expect(await confirmedFaculty(gdc.organizationId)).toHaveLength(0);

    await expect(decideFacultyAppointment(outsider, appointmentId, { decision: 'CONFIRM' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(decideFacultyAppointment(ravi, appointmentId, { decision: 'CONFIRM' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(collegeFaculty(outsider, gdc.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await decideFacultyAppointment(gdc.admin, appointmentId, { decision: 'CONFIRM' });
    expect(await testDb().inAppNotification.count({ where: { userId: ravi.userId, notificationId: 'TL-NOTIF-FACULTY-DECISION-001' } })).toBe(1);
    const page = await getPublicAcademic('FACULTY', 'ravi-sahu');
    expect(page?.facultyAppointments.map((f) => [f.designation, f.organization.name])).toEqual([['Reader', 'College gdc-raipur']]);
    expect((await confirmedFaculty(gdc.organizationId)).map((f) => f.profile.slug)).toEqual(['ravi-sahu']);
    await expect(decideFacultyAppointment(gdc.admin, appointmentId, { decision: 'DECLINE' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // The member ends it; asking again reopens it; the college may decline.
    await decideFacultyAppointment(ravi, appointmentId, { decision: 'END' });
    expect(await confirmedFaculty(gdc.organizationId)).toHaveLength(0);
    await requestFacultyAppointment(ravi, { organizationId: gdc.organizationId, designation: 'Professor' });
    await decideFacultyAppointment(gdc.admin, appointmentId, { decision: 'DECLINE' });
    const mine = await myAcademic(ravi);
    expect(mine[0]!.facultyAppointments.map((f) => [f.status, f.designation])).toEqual([['DECLINED', 'Professor']]);
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'FACULTY_APPOINTMENT_' } } })).toBe(5);
  });
});
