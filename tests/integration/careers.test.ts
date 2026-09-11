/**
 * TL-TEST-CAREERS-001 — jobs, internships and applications.
 *
 * Postings: no contact details or links; internship ↔ employment type; pay
 * order; closing date; only a verified organization publishes; drafts never
 * public; front-desk staff cannot post. Applying: verified email, consent,
 * once per posting, not at one's own organization; the résumé readable by the
 * employer only while the application stands. Moves follow the status order
 * and tell the applicant; withdrawal hides the applicant's details; postings
 * close after their date.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { actOnApplication, applyToPosting, closeExpiredPostings, createPosting, getPosting, listPostings, myApplications, postingApplications, setPostingStatus, updatePosting, withdrawApplication } from '@/platform/careers/service';
import { canReadFile } from '@/platform/storage/files';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;
const PDF = { filename: 'cv.pdf', declaredType: 'application/pdf', bytes: new Uint8Array(Buffer.from('%PDF-1.4\n% a small résumé for tests\n%%EOF\n')) };
const DESCRIPTION = 'An associate dentist for a busy family practice: general dentistry, root canals and crowns, five and a half days a week with one weekday off.';
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function person(label: string, verifiedEmail = true) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} Rao${seq}`, role: 'patient', acceptedTerms: true });
  if (verifiedEmail) await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), phone: `+9198270${String(10000 + seq).slice(-5)}` } });
  return userId;
}

async function employer(slug: string, verified = true) {
  const ownerId = await person(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `Smile ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  if (verified) await testDb().organization.update({ where: { id: organizationId }, data: { verifiedAt: new Date() } });
  const staffId = await person(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

const JOB = { kind: 'JOB' as const, role: 'DENTIST' as const, employmentType: 'FULL_TIME' as const, title: 'Associate dentist', description: DESCRIPTION, payMin: 45000, payMax: 70000 };
const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Careers', () => {
  beforeAll(async () => {
    process.env.STORAGE_PROVIDER ??= 'local';
    process.env.STORAGE_LOCAL_DIR ??= mkdtempSync(join(tmpdir(), 'toothlogy-careers-'));
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('checks postings, and publishes only for a verified organization', async () => {
    const e = await employer('careers-a', false);
    expect(await code(createPosting(e.admin, e.organizationId, { ...JOB, description: `${DESCRIPTION} Call 9827012345 today.` }))).toBe('VALIDATION_FAILED');
    expect(await code(createPosting(e.admin, e.organizationId, { ...JOB, description: `${DESCRIPTION} Details at www.example.com` }))).toBe('VALIDATION_FAILED');
    expect(await code(createPosting(e.admin, e.organizationId, { ...JOB, kind: 'INTERNSHIP' }))).toBe('VALIDATION_FAILED');
    expect(await code(createPosting(e.admin, e.organizationId, { ...JOB, payMin: 90000 }))).toBe('VALIDATION_FAILED');
    expect(await code(createPosting(e.admin, e.organizationId, { ...JOB, closesOn: '2020-01-01' }))).toBe('VALIDATION_FAILED');
    expect(await code(createPosting(e.staff, e.organizationId, JOB))).toBe('NOT_FOUND');

    const { postingId } = await createPosting(e.admin, e.organizationId, { ...JOB, closesOn: inDays(30) });
    expect(await getPosting(postingId)).toBeNull(); // a draft is not public
    expect(await code(setPostingStatus(e.admin, postingId, { status: 'OPEN' }))).toBe('PRECONDITION_FAILED');
    await testDb().organization.update({ where: { id: e.organizationId }, data: { verifiedAt: new Date() } });
    await setPostingStatus(e.admin, postingId, { status: 'OPEN' });
    expect(await code(setPostingStatus(e.admin, postingId, { status: 'OPEN' }))).toBe('CONFLICT');

    expect((await listPostings({ q: 'associate' })).items.map((p) => p.id)).toEqual([postingId]);
    expect((await listPostings({ role: 'ASSISTANT' })).total).toBe(0);
    expect((await listPostings({ kind: 'INTERNSHIP' })).total).toBe(0);
    const intern = await createPosting(e.admin, e.organizationId, { kind: 'INTERNSHIP', role: 'INTERN', employmentType: 'INTERNSHIP', title: 'Rotating intern', description: DESCRIPTION, payMin: 8000 });
    await setPostingStatus(e.admin, intern.postingId, { status: 'OPEN' });
    expect((await listPostings({ kind: 'INTERNSHIP' })).items.map((p) => p.id)).toEqual([intern.postingId]);
    await updatePosting(e.admin, postingId, { payMax: 80000 });
    expect((await getPosting(postingId))!.payMaxMinor).toBe(8_000_000);
    await setPostingStatus(e.admin, postingId, { status: 'FILLED' });
    expect(await code(updatePosting(e.admin, postingId, { title: 'Associate dentist (again)' }))).toBe('PRECONDITION_FAILED');
    expect((await getPosting(postingId))!.accepting).toBe(false);
  });

  it('takes one application per person with consent, shares the résumé while it stands, and tells the applicant each move', async () => {
    const e = await employer('careers-b');
    const other = await employer('careers-b2');
    const { postingId } = await createPosting(e.admin, e.organizationId, { ...JOB, closesOn: inDays(20) });
    await setPostingStatus(e.admin, postingId, { status: 'OPEN' });

    const unverified = principal(await person('newbie', false), ['patient']);
    expect(await code(applyToPosting(unverified, postingId, { consent: true }))).toBe('PRECONDITION_FAILED');
    const applicant = principal(await person('meena'), ['student']);
    expect(await code(applyToPosting(applicant, postingId, { consent: false }))).toBe('VALIDATION_FAILED');
    expect(await code(applyToPosting(e.staff, postingId, { consent: true }))).toBe('PRECONDITION_FAILED');
    const { applicationId } = await applyToPosting(applicant, postingId, { consent: true, coverNote: 'Two years in a Raipur practice; keen on endodontics.' }, PDF);
    expect(await code(applyToPosting(applicant, postingId, { consent: true }))).toBe('CONFLICT');

    const told = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: e.admin.userId, notificationId: 'TL-NOTIF-APPLICATION-RECEIVED-001' } });
    expect(told.body).toContain('Associate dentist');
    const seen = await postingApplications(e.admin, postingId);
    const row = seen.applications[0]!;
    expect(row.applicant.email).toMatch(/^meena-/);
    expect(row.resumeFile).not.toBeNull();
    const file = await testDb().fileObject.findUniqueOrThrow({ where: { id: row.resumeFile!.id } });
    expect(file).toMatchObject({ ownerUserId: applicant.userId, purpose: 'RESUME' });
    expect(await canReadFile(e.admin, file)).toBe(true);
    expect(await canReadFile(e.staff, file)).toBe(false);
    expect(await canReadFile(other.admin, file)).toBe(false);
    expect(await code(postingApplications(e.staff, postingId))).toBe('NOT_FOUND');

    expect(await code(actOnApplication(e.admin, applicationId, { action: 'OFFER' }))).toBe('CONFLICT');
    await actOnApplication(e.admin, applicationId, { action: 'SHORTLIST', employerNote: 'Strong on endo.' });
    expect(await code(actOnApplication(e.admin, applicationId, { action: 'INTERVIEW' }))).toBe('VALIDATION_FAILED');
    const at = new Date(Date.now() + 3 * DAY);
    await actOnApplication(e.admin, applicationId, { action: 'INTERVIEW', interviewAt: at.toISOString(), message: 'Bring your registration certificate.' });
    const update = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: applicant.userId, notificationId: 'TL-NOTIF-APPLICATION-UPDATE-001' }, orderBy: { createdAt: 'desc' } });
    expect(update.body).toContain('has an interview on');
    const mine = await myApplications(applicant);
    expect(mine[0]).toMatchObject({ status: 'INTERVIEW', messageToApplicant: 'Bring your registration certificate.' });
    expect(mine[0]).not.toHaveProperty('employerNote');

    await withdrawApplication(applicant, applicationId);
    expect(await code(withdrawApplication(applicant, applicationId))).toBe('CONFLICT');
    const after = (await postingApplications(e.admin, postingId)).applications[0]!;
    expect(after).toMatchObject({ status: 'WITHDRAWN', applicant: { email: null, phone: null }, resumeFile: null, coverNote: null });
    expect(await canReadFile(e.admin, file)).toBe(false);
    expect(await code(actOnApplication(e.admin, applicationId, { action: 'REJECT' }))).toBe('CONFLICT');
  });

  it('closes postings after their date and stops applications', async () => {
    const e = await employer('careers-c');
    const { postingId } = await createPosting(e.admin, e.organizationId, { ...JOB, closesOn: inDays(1) });
    await setPostingStatus(e.admin, postingId, { status: 'OPEN' });
    expect(await closeExpiredPostings(new Date(Date.now() + 3 * DAY))).toEqual({ closed: 1 });
    expect((await getPosting(postingId))!).toMatchObject({ status: 'CLOSED', accepting: false });
    const applicant = principal(await person('late'), ['patient']);
    expect(await code(applyToPosting(applicant, postingId, { consent: true }))).toBe('PRECONDITION_FAILED');
    expect((await listPostings({})).total).toBe(0);
  });
});
