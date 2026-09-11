/**
 * TL-TEST-INDIA-DATA-001 — districts, extraction, pre-made accounts, activation.
 *
 * Districts seeded and matched by name or alias, imports idempotent; extracted
 * rows kept as received, normalized, district-matched, de-duplicated against
 * rows, accounts and registrations, always UNVERIFIED; pre-made dentist
 * accounts inactive until email + mobile OTP activation, never a second
 * account; unowned listings claimed through review; staff-only access.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { reviewVerification } from '@/platform/verification/service';
import { importDistricts, listDistricts, matchDistrict } from '@/platform/india-data/districts';
import { createPremadeAccount, districtCoverage, importExtractionBatch, listExtractedRecords, rejectExtractedRecord } from '@/platform/india-data/extraction';
import { completeActivation, START_MESSAGE, startActivation } from '@/platform/india-data/activation';
import { emailProvider, smsProvider, type EmailMessage, type SmsMessage } from '@/platform/notifications/ports';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';

function principal(userId: string, roles: string[]): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations: [], sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: label, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

const emails: EmailMessage[] = [];
const texts: SmsMessage[] = [];
const receipt = (channel: 'email' | 'sms') => ({ providerMessageId: `test-${Math.random()}`, channel, acceptedAt: new Date(), status: 'accepted' as const });

let staff: AuthenticatedPrincipal;
let outsider: AuthenticatedPrincipal;

const DENTIST_ROW = { 'Doctor Name': 'Dr. Anil Sharma', Mobile: '098270 12345', 'E-mail': 'Anil.Sharma@Example.test', 'Registration No': 'cgdc/101', District: 'Raipur', State: 'Chhattisgarh' };

async function importDentists(rows: Array<Record<string, string | null>>, source = 'CG Dental Council list 2026') {
  return importExtractionBatch(staff, { source, entityType: 'DENTIST', countryCode: 'IN', rows });
}

describeIntegration('India data', () => {
  beforeAll(async () => {
    await assertSeeded();
    emailProvider.set({ send: async (m) => (emails.push(m), receipt('email')) });
    smsProvider.set({ send: async (m) => (texts.push(m), receipt('sms')) });
  });
  afterAll(async () => {
    emailProvider.set(null);
    smsProvider.set(null);
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    emails.length = 0;
    texts.length = 0;
    staff = principal(await user('staff'), ['platform_admin']);
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('seeds Chhattisgarh’s districts, matches names and aliases, and imports idempotently', async () => {
    const cg = await listDistricts({ countryCode: 'IN' });
    const inCg = cg.filter((d) => d.state === 'Chhattisgarh');
    expect(inCg).toHaveLength(33);
    expect((await matchDistrict('IN', 'Chhattisgarh', 'raipur'))?.name).toBe('Raipur');
    expect((await matchDistrict('IN', 'Chhattisgarh', 'Kawardha'))?.name).toBe('Kabirdham');
    expect((await matchDistrict('IN', null, 'Dantewada'))?.name).toBe('Dantewada');
    expect(await matchDistrict('IN', 'Chhattisgarh', 'Atlantis')).toBeNull();

    const outcome = await importDistricts(staff, { countryCode: 'IN', rows: [{ state: 'Chhattisgarh', district: 'Raipur' }, { state: 'Chhattisgarh', district: 'Kawardha' }, { state: 'Atlantis', district: 'Nowhere' }] });
    expect(outcome.created).toBe(0);
    expect(outcome.unknownStates).toEqual(['Atlantis']);
    expect((await listDistricts({ countryCode: 'IN' })).filter((d) => d.state === 'Chhattisgarh')).toHaveLength(33);
    await expect(importDistricts(outsider, { countryCode: 'IN', rows: [{ state: 'Chhattisgarh', district: 'Raipur' }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps each row as received beside its normalized form, unverified, and de-duplicates within and across batches and against accounts', async () => {
    const takenEmail = `taken-${seq + 1}@example.test`;
    await register({ email: takenEmail, password: PASSWORD, displayName: 'Existing', role: 'dentist', acceptedTerms: true });
    const result = await importDentists([
      DENTIST_ROW,
      { name: 'Anil Sharma', phone: '+91 98270-12345', 'registration number': 'CGDC 101', district: 'raipur' },
      { name: '', phone: '9827000000' },
      { name: 'Dr. Existing Person', email: takenEmail, district: 'Kawardha', state: 'Chhattisgarh' },
      { name: 'Dr. Priya Verma', mobile: '0771-2234567', email: 'priya@example', district: 'Unknownpur' },
    ]);
    expect(result).toMatchObject({ total: 5, new: 2, duplicate: 2, rejected: 1 });

    const records = await listExtractedRecords(staff, {});
    const byRow = new Map(records.map((r) => [r.rowNumber, r]));
    const anil = byRow.get(1)!;
    expect(anil).toMatchObject({ status: 'NEW', verification: 'UNVERIFIED', name: 'Anil Sharma', phone: '+919827012345', email: 'anil.sharma@example.test', registrationNumber: 'CGDC-101', source: 'CG Dental Council list 2026' });
    expect(anil.district?.name).toBe('Raipur');
    expect(anil.original).toEqual(DENTIST_ROW);
    expect(anil.confidence).toBeGreaterThanOrEqual(80);
    expect(byRow.get(2)).toMatchObject({ status: 'DUPLICATE', duplicateOfId: anil.id });
    expect(byRow.get(3)).toMatchObject({ status: 'REJECTED' });
    expect(byRow.get(4)).toMatchObject({ status: 'DUPLICATE' });
    expect(byRow.get(4)!.matchedUserId).toBeTruthy();
    expect(byRow.get(4)!.district?.name).toBe('Kabirdham');
    const priya = byRow.get(5)!;
    expect(priya).toMatchObject({ status: 'NEW', phone: null, email: null, districtId: null });
    expect((priya.normalized as { problems: string[] }).problems).toHaveLength(3);
    expect(priya.confidence).toBeLessThan(anil.confidence);

    // The same file again: nothing new.
    const again = await importDentists([DENTIST_ROW]);
    expect(again).toMatchObject({ new: 0, duplicate: 1 });

    const coverage = await districtCoverage(staff);
    const raipur = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!;
    expect(coverage.filter((c) => c.districtId === raipur.id).reduce((n, c) => n + c.count, 0)).toBe(3);

    await rejectExtractedRecord(staff, priya.id, { reason: 'Not a dentist' });
    await expect(rejectExtractedRecord(staff, priya.id, { reason: 'again' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const audit = await testDb().auditEvent.findMany({ where: { action: { in: ['EXTRACTION_BATCH_IMPORTED', 'EXTRACTED_RECORD_REJECTED'] } } });
    expect(audit).toHaveLength(3);
  });

  it('creates one inactive pre-made dentist account, never a second, and activates it only with the email link and the mobile code', async () => {
    await importDentists([DENTIST_ROW, { name: 'Dr. No Phone', email: 'nophone@example.test', 'registration number': 'CGDC-202' }]);
    const [anil, noPhone] = (await listExtractedRecords(staff, {})).sort((a, b) => a.rowNumber - b.rowNumber);
    await expect(createPremadeAccount(staff, noPhone!.id)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const created = await createPremadeAccount(staff, anil!.id);
    expect(created.kind).toBe('USER');
    await expect(createPremadeAccount(staff, anil!.id)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const premade = await testDb().user.findUniqueOrThrow({ where: { id: created.id }, include: { dentistProfile: true, credentials: true } });
    expect(premade).toMatchObject({ status: 'PENDING_ACTIVATION', email: 'anil.sharma@example.test', phone: '+919827012345', emailVerifiedAt: null, phoneVerifiedAt: null });
    expect(premade.dentistProfile).toMatchObject({ status: 'DRAFT', isDiscoverable: false });
    expect(premade.credentials).toHaveLength(0);

    // The same person later appears in another file: a duplicate, matched to the account.
    await importDentists([{ ...DENTIST_ROW, 'Registration No': null }], 'IDA Raipur directory');
    const later = (await listExtractedRecords(staff, { status: 'DUPLICATE' }))[0]!;
    expect(later.duplicateOfId ?? later.matchedUserId).toBeTruthy();

    // Registering again with the same email does not make a second account.
    await register({ email: 'anil.sharma@example.test', password: PASSWORD, displayName: 'Anil', role: 'dentist', acceptedTerms: true }).catch(() => undefined);
    expect(await testDb().user.count({ where: { email: 'anil.sharma@example.test' } })).toBe(1);

    // Starting activation answers the same way, matched or not; only a match sends anything.
    expect(await startActivation({ email: 'someone@example.test', phone: '9000000000' })).toEqual({ message: START_MESSAGE });
    expect(await startActivation({ email: 'anil.sharma@example.test', phone: '9111111111' })).toEqual({ message: START_MESSAGE });
    expect(emails).toHaveLength(0);
    expect(texts).toHaveLength(0);
    expect(await startActivation({ email: 'ANIL.SHARMA@example.test', phone: '098270 12345' })).toEqual({ message: START_MESSAGE });
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe('anil.sharma@example.test');
    expect(texts).toHaveLength(1);
    expect(texts[0]!.to).toBe('+919827012345');
    // A second request inside the resend window still answers the same, without a second SMS.
    expect(await startActivation({ email: 'anil.sharma@example.test', phone: '9827012345' })).toEqual({ message: START_MESSAGE });
    expect(texts).toHaveLength(1);

    const link = /\/activate\?token=([^\s]+)/.exec(emails.at(-1)!.textBody);
    expect(link).not.toBeNull();
    const token = decodeURIComponent(link![1]!);
    const code = /\b(\d{6})\b/.exec(texts[0]!.body)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';

    await expect(completeActivation({ token, code, password: 'short', acceptedTerms: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(completeActivation({ token, code: wrong, password: PASSWORD, acceptedTerms: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(completeActivation({ token: 'x'.repeat(40), code, password: PASSWORD, acceptedTerms: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    // The wrong code did not spend the email link.
    expect(await completeActivation({ token, code, password: PASSWORD, acceptedTerms: true })).toEqual({ activated: true });
    await expect(completeActivation({ token, code, password: PASSWORD, acceptedTerms: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const active = await testDb().user.findUniqueOrThrow({ where: { id: created.id }, include: { credentials: true } });
    expect(active.status).toBe('ACTIVE');
    expect(active.emailVerifiedAt).not.toBeNull();
    expect(active.phoneVerifiedAt).not.toBeNull();
    expect(active.credentials.filter((c) => c.type === 'PASSWORD')).toHaveLength(1);
    expect(await testDb().extractedRecord.findUniqueOrThrow({ where: { id: anil!.id } })).toMatchObject({ status: 'ACTIVATED', verification: 'UNVERIFIED' });
    expect(await testDb().auditEvent.count({ where: { action: { in: ['PREMADE_ACCOUNT_CREATED', 'PREMADE_ACTIVATION_STARTED', 'PREMADE_ACCOUNT_ACTIVATED'] } } })).toBeGreaterThanOrEqual(3);
    // Once active, activation cannot start again.
    const before = emails.length;
    await startActivation({ email: 'anil.sharma@example.test', phone: '9827012345' });
    expect(emails).toHaveLength(before);
  });

  it('turns a clinic row into an unowned, pending listing in its district, claimed through review', async () => {
    const raipur = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!;
    await importExtractionBatch(staff, {
      source: 'Clinic survey',
      entityType: 'CLINIC',
      countryCode: 'IN',
      districtId: raipur.id,
      rows: [{ 'Clinic Name': 'Smile  Dental Care', Phone: '9827099999', Address: 'Station Road', City: 'Raipur', Pincode: '492 001' }],
    });
    const [row] = await listExtractedRecords(staff, { entityType: 'CLINIC' });
    const created = await createPremadeAccount(staff, row!.id);
    expect(created.kind).toBe('ORGANIZATION');
    const organization = await testDb().organization.findUniqueOrThrow({ where: { id: created.id }, include: { locations: { include: { address: true } } } });
    expect(organization).toMatchObject({ status: 'PENDING', ownerUserId: null, type: 'CLINIC', name: 'Smile Dental Care' });
    expect(organization.locations[0]).toMatchObject({ districtId: raipur.id, isPrimary: true });
    expect(organization.locations[0]!.address?.postalCode).toBe('492001');

    // The same clinic in a later file is a duplicate of the listing.
    await importExtractionBatch(staff, { source: 'Another list', entityType: 'CLINIC', countryCode: 'IN', rows: [{ name: 'Smile Dental Care', phone: '98270 99999' }] });
    expect((await listExtractedRecords(staff, { status: 'DUPLICATE', entityType: 'CLINIC' })).length).toBe(1);

    const claimant = await user('claimant');
    const reviewerId = await user('reviewer');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'moderator' } });
    const requestId = `vrq_${Math.random().toString(36).slice(2)}`;
    await testDb().verificationRequest.create({ data: { id: requestId, subjectType: 'ORGANIZATION_CLAIM', subjectId: created.id, status: 'PENDING', submittedByUserId: claimant, submittedEvidence: { role: 'Owner', note: null, documents: [] } } });
    await reviewVerification({ verificationRequestId: requestId, decision: 'APPROVED' }, reviewerId);
    expect((await testDb().organization.findUniqueOrThrow({ where: { id: created.id } })).ownerUserId).toBe(claimant);
    expect(await testDb().extractedRecord.findUniqueOrThrow({ where: { id: row!.id } })).toMatchObject({ status: 'CLAIMED', verification: 'UNVERIFIED' });
  });

  it('refuses every data operation to anyone without the staff permission', async () => {
    await importDentists([DENTIST_ROW]);
    const [record] = await listExtractedRecords(staff, {});
    await expect(importExtractionBatch(outsider, { source: 'Mine', entityType: 'DENTIST', countryCode: 'IN', rows: [DENTIST_ROW] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listExtractedRecords(outsider, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createPremadeAccount(outsider, record!.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(rejectExtractedRecord(outsider, record!.id, { reason: 'spite' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(districtCoverage(outsider)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(importExtractionBatch(staff, { source: 'Bad district', entityType: 'DENTIST', countryCode: 'IN', districtId: 'dst_nope', rows: [DENTIST_ROW] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await testDb().extractedRecord.findUniqueOrThrow({ where: { id: record!.id } })).toMatchObject({ status: 'NEW' });
  });
});
