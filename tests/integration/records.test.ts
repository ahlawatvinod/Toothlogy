/**
 * TL-TEST-RECORDS-001 — the patient-owned dental record and prescriptions.
 *
 * The patient keeps their own record; a practice sees nothing without a
 * grant (not even that a record exists); request → allow → every view audited
 * and listed for the patient; adding under a read-and-add grant, files owned
 * by the patient and readable by the practice only while the grant lasts;
 * retraction instead of deletion; withdrawal ends access and the consent.
 * Prescriptions: only a verified dentist under a grant that allows adding;
 * the public QR check; cancellation; grant expiry; the personal-data export.
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import {
  accessHistory,
  addMyEntry,
  addPracticeEntry,
  cancelPrescription,
  deleteMyEntry,
  expireGrants,
  getPrescription,
  grantAccess,
  issuePrescription,
  myRecord,
  practicePatients,
  practiceRecord,
  requestAccess,
  respondToRequest,
  retractEntry,
  revokeGrant,
  verifyPrescription,
  firstNameAndInitial,
} from '@/platform/records/service';
import { canReadFile } from '@/platform/storage/files';
import { exportUserData } from '@/platform/users/export';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { addDays } from '@/lib/zoned-time';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;
const PNG = { filename: 'upper-molars.png', declaredType: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(7)]) };
const today = () => new Date().toISOString().slice(0, 10);

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} Kumar${seq}`, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

/** A clinic with an unverified owner, a verified dentist (clinician) and front-desk staff. */
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
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: dentistUserId, organizationId, roleKey: 'clinician' } });
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    practiceId,
    admin: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]),
    dentist: principal(dentistUserId, ['dentist'], [{ organizationId, roles: ['clinician'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

let slotIndex = 0;
async function book(p: Awaited<ReturnType<typeof practice>>, patient: AuthenticatedPrincipal) {
  const date = addDays(localDateOf(new Date(), TZ), 1);
  const { slots } = await availableSlots({ practiceId: p.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
  const { appointment } = await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[slotIndex++ % slots.length]!.startsAt });
  return appointment.id;
}

async function patientNamed(label: string) {
  const id = await user(label);
  return principal(id, ['patient']);
}

const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Dental record and prescriptions', () => {
  beforeAll(async () => {
    process.env.STORAGE_PROVIDER ??= 'local';
    process.env.STORAGE_LOCAL_DIR ??= mkdtempSync(join(tmpdir(), 'toothlogy-records-'));
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
    useDatabaseAuditSink();
  });
  beforeEach(async () => {
    await resetDatabase();
    // Every view must reach audit_events: the patient's "who looked" reads them.
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('keeps the patient’s own record, and shows a practice nothing without a grant', async () => {
    const p = await practice('rec-a');
    const patient = await patientNamed('asha');
    await book(p, patient);

    const { entryId } = await addMyEntry(patient, { kind: 'TREATMENT', title: 'Root canal, upper left', notes: 'Done in 2023 at another clinic.', occurredOn: '2023-05-10', teeth: '26, 16 26' });
    const own = await testDb().recordEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(own).toMatchObject({ teeth: [16, 26], organizationId: null, authorUserId: patient.userId });
    expect(await code(addMyEntry(patient, { kind: 'TREATMENT', title: 'Filling', notes: 'x', occurredOn: today(), teeth: '19' }))).toBe('VALIDATION_FAILED');
    expect(await code(addMyEntry(patient, { kind: 'IMAGING', title: 'OPG', occurredOn: today() }))).toBe('VALIDATION_FAILED');
    expect(await code(addMyEntry(patient, { kind: 'VISIT_NOTE', title: 'Visit', notes: 'x', occurredOn: '2099-01-01' }))).toBe('VALIDATION_FAILED');

    // Without a grant: not found, not forbidden — the record's existence is private.
    expect(await code(practiceRecord(p.admin, p.organizationId, patient.userId))).toBe('NOT_FOUND');
    expect(await code(addPracticeEntry(p.dentist, p.organizationId, patient.userId, { kind: 'VISIT_NOTE', title: 'Check-up', notes: 'Fine.', occurredOn: today() }, undefined))).toBe('NOT_FOUND');
    const list = await practicePatients(p.admin, p.organizationId);
    expect(list.others.map((o) => o.userId)).toContain(patient.userId);
    expect(list.active).toHaveLength(0);
    // Front-desk staff do not see clinical records at all.
    expect(await code(practicePatients(p.staff, p.organizationId))).toBe('NOT_FOUND');
    // A practice the patient never visited cannot ask.
    const other = await practice('rec-a2');
    expect(await code(requestAccess(other.admin, other.organizationId, patient.userId, {}))).toBe('NOT_FOUND');
  });

  it('asks, is allowed, views under audit, adds a file the patient owns, and loses it all on withdrawal', async () => {
    const p = await practice('rec-b');
    const stranger = await practice('rec-b2');
    const patient = await patientNamed('meera');
    await book(p, patient);
    await addMyEntry(patient, { kind: 'TREATMENT', title: 'Braces removed', notes: 'Retainer at night.', occurredOn: '2021-02-01' });

    const { grantId } = await requestAccess(p.admin, p.organizationId, patient.userId, { note: 'For your visit tomorrow.' });
    expect(await code(requestAccess(p.admin, p.organizationId, patient.userId, {}))).toBe('CONFLICT');
    const asked = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-RECORD-ACCESS-REQUEST-001' } });
    expect(asked.body).toContain('Clinic rec-b');
    expect((await myRecord(patient)).requests.map((r) => r.id)).toEqual([grantId]);
    // Still nothing visible while only requested.
    expect(await code(practiceRecord(p.admin, p.organizationId, patient.userId))).toBe('NOT_FOUND');

    await respondToRequest(patient, grantId, { decision: 'APPROVE', canWrite: true, days: '30' });
    expect(await code(respondToRequest(patient, grantId, { decision: 'DECLINE' }))).toBe('NOT_FOUND');
    const grant = await testDb().recordAccessGrant.findUniqueOrThrow({ where: { id: grantId }, include: { consent: true } });
    expect(grant).toMatchObject({ status: 'ACTIVE', canWrite: true });
    expect(grant.consent).toMatchObject({ userId: patient.userId, purpose: 'CLINICAL_DATA_SHARING', revokedAt: null });
    expect(grant.expiresAt!.getTime() - Date.now()).toBeGreaterThan(29 * DAY);

    const seen = await practiceRecord(p.admin, p.organizationId, patient.userId);
    expect(seen.entries.map((e) => e.title)).toEqual(['Braces removed']);
    expect(seen.canWrite).toBe(true);
    expect(seen.canPrescribe).toBe(false); // the owner is not a verified dentist

    const { entryId } = await addPracticeEntry(p.dentist, p.organizationId, patient.userId, { kind: 'IMAGING', title: 'Bitewing, right side', occurredOn: today(), teeth: '46 47' }, PNG);
    const entry = await testDb().recordEntry.findUniqueOrThrow({ where: { id: entryId }, include: { file: true } });
    expect(entry.organizationId).toBe(p.organizationId);
    expect(entry.file).toMatchObject({ ownerUserId: patient.userId, purpose: 'XRAY', sensitivity: 'PHI' });
    expect(await canReadFile(p.dentist, entry.file!)).toBe(true);
    expect(await canReadFile(p.staff, entry.file!)).toBe(false);
    expect(await canReadFile(stranger.admin, entry.file!)).toBe(false);
    const updated = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001' } });
    expect(updated.body).not.toContain('Bitewing');

    // The patient cannot delete what the practice added; the practice retracts, visibly.
    expect(await code(deleteMyEntry(patient, entryId))).toBe('NOT_FOUND');
    await retractEntry(p.dentist, p.organizationId, entryId, { reason: 'Wrong patient’s image attached.' });
    expect(await code(retractEntry(p.dentist, p.organizationId, entryId, { reason: 'Again, twice.' }))).toBe('NOT_FOUND');
    expect((await myRecord(patient)).entries.find((e) => e.id === entryId)).toMatchObject({ retractedReason: 'Wrong patient’s image attached.' });

    const history = await accessHistory(patient.userId);
    expect(history.map((h) => h.what)).toEqual(expect.arrayContaining(['opened your record', 'added to your record', 'retracted an entry they had added']));
    expect(history.find((h) => h.what === 'opened your record')).toMatchObject({ practice: 'Clinic rec-b' });

    await revokeGrant(patient, grantId);
    expect(await code(practiceRecord(p.admin, p.organizationId, patient.userId))).toBe('NOT_FOUND');
    expect(await canReadFile(p.dentist, entry.file!)).toBe(false);
    expect((await testDb().consent.findUniqueOrThrow({ where: { id: grant.consentId! } })).revokedAt).not.toBeNull();
    // Still the patient's: the entry the practice added stays in their record.
    expect((await myRecord(patient)).entries.map((e) => e.id)).toContain(entryId);
    // And the practice may ask again.
    await requestAccess(p.admin, p.organizationId, patient.userId, {});
  });

  it('issues prescriptions only from a verified dentist under a read-and-add grant; QR check; cancel; expiry; export', async () => {
    const p = await practice('rec-c');
    const patient = await patientNamed('ravi');
    const appointmentId = await book(p, patient);
    const items = [{ medicine: 'Amoxicillin', strength: '500 mg', dose: '1 capsule', frequency: 'Three times a day', duration: '5 days', instructions: 'After food' }];

    await grantAccess(patient, { organizationId: p.organizationId, canWrite: false, days: '0' });
    expect(await code(issuePrescription(p.dentist, p.organizationId, patient.userId, { items, appointmentId }))).toBe('PRECONDITION_FAILED');
    const { grantId } = await grantAccess(patient, { organizationId: p.organizationId, canWrite: true, days: '30' });
    expect(await code(issuePrescription(p.admin, p.organizationId, patient.userId, { items }))).toBe('PRECONDITION_FAILED');
    expect(await code(issuePrescription(p.dentist, p.organizationId, patient.userId, { items: [] }))).toBe('VALIDATION_FAILED');

    const { prescriptionId } = await issuePrescription(p.dentist, p.organizationId, patient.userId, { items, advice: 'Warm salt-water rinses.', appointmentId });
    const rx = await testDb().prescription.findUniqueOrThrow({ where: { id: prescriptionId } });
    expect(rx.verifyCode).toMatch(/^[A-Z2-9]{16}$/);
    const patientName = (await testDb().user.findUniqueOrThrow({ where: { id: patient.userId } })).displayName;
    const check = await verifyPrescription(rx.verifyCode);
    expect(check).toMatchObject({ status: 'ISSUED', practice: 'Clinic rec-c', verifiedDentist: true, patient: firstNameAndInitial(patientName) });
    expect(check!.items[0]!.medicine).toBe('Amoxicillin');
    expect(check).not.toHaveProperty('advice');
    expect(await verifyPrescription('AAAAAAAAAAAAAAAA')).toBeNull();
    expect(await verifyPrescription('../../etc')).toBeNull();

    expect((await getPrescription(patient, prescriptionId)).side).toBe('PATIENT');
    expect((await getPrescription(p.admin, prescriptionId)).canCancel).toBe(true);
    const outsider = await patientNamed('outsider');
    expect(await code(getPrescription(outsider, prescriptionId))).toBe('NOT_FOUND');
    const issued = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-PRESCRIPTION-ISSUED-001' } });
    expect(issued.body).not.toContain('Amoxicillin');

    expect(await code(cancelPrescription(p.staff, prescriptionId, { reason: 'Front desk should not.' }))).toBe('NOT_FOUND');
    await cancelPrescription(p.dentist, prescriptionId, { reason: 'Allergy to penicillin reported.' });
    expect(await code(cancelPrescription(p.dentist, prescriptionId, { reason: 'Allergy to penicillin reported.' }))).toBe('CONFLICT');
    expect(await verifyPrescription(rx.verifyCode)).toMatchObject({ status: 'CANCELLED' });

    // Time runs out: the grant ends and so does its consent.
    expect(await expireGrants(new Date(Date.now() + 31 * DAY))).toEqual({ expired: 1 });
    const ended = await testDb().recordAccessGrant.findUniqueOrThrow({ where: { id: grantId }, include: { consent: true } });
    expect(ended).toMatchObject({ status: 'EXPIRED', openKey: null });
    expect(ended.consent?.revokedAt).not.toBeNull();

    const exported = (await exportUserData(patient.userId)).sections as Record<string, unknown[]>;
    expect(exported.prescriptions).toHaveLength(1);
    expect(exported.recordAccessGrants).toHaveLength(1);
  });
});
