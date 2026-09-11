/**
 * TL-TEST-TREATMENT-PLANS-001 — proposed by the practice, decided by the patient.
 *
 * Proposed only under a read-and-add grant (not found without a grant, refused
 * under read-only, never by front-desk staff); validated (estimates, catalogue
 * keys, FDI teeth); decided once by the patient only; progress only on an
 * accepted plan, completing exactly once even when the last two treatments
 * are recorded at the same moment; withdrawn with a reason the patient sees;
 * still the patient's after access ends; in "who looked" and the export.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import { accessHistory, grantAccess, myRecord, revokeGrant } from '@/platform/records/service';
import { actOnPlanItem, cancelPlan, decidePlan, proposePlan, toMinor } from '@/platform/records/treatment-plans';
import { exportUserData } from '@/platform/users/export';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { addDays } from '@/lib/zoned-time';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} Rao${seq}`, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

/** A clinic with its owner (admin), a verified dentist (clinician) and front-desk staff. */
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
  await bookAppointment(patient, { practiceId: p.practiceId, startsAt: slots[slotIndex++ % slots.length]!.startsAt });
}

const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Treatment plans', () => {
  beforeAll(async () => {
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('converts estimates exactly to minor units', () => {
    expect([toMinor('1500'), toMinor('1500.5'), toMinor('1500.05'), toMinor('0')]).toEqual([150000n, 150050n, 150005n, 0n]);
  });

  it('is proposed under a read-and-add grant, decided once by the patient, progressed to completion, and stays the patient’s', async () => {
    const p = await practice('tp-a');
    const other = await practice('tp-b');
    const patient = principal(await user('meena'), ['patient']);
    const stranger = principal(await user('stranger'), ['patient']);
    await book(p, patient);
    const treatmentKey = (await testDb().treatment.findFirstOrThrow({ where: { isActive: true }, select: { key: true } })).key;
    const plan = {
      title: 'Restore the upper right',
      notes: 'Two visits.',
      items: [
        { description: 'Root canal treatment', treatmentKey, teeth: '16', estimate: '6500' },
        { description: 'Crown', teeth: '16', estimate: '8000.50' },
      ],
    };

    // No grant: the patient's plans, like the record, do not exist for the practice.
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, plan))).toBe('NOT_FOUND');
    // Read-only: refused.
    await grantAccess(patient, { organizationId: p.organizationId, canWrite: false, days: '30' });
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, plan))).toBe('PRECONDITION_FAILED');
    const { grantId } = await grantAccess(patient, { organizationId: p.organizationId, canWrite: true, days: '30' });
    // Front-desk staff never see clinical records.
    expect(await code(proposePlan(p.staff, p.organizationId, patient.userId, plan))).toBe('NOT_FOUND');

    // Validation.
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, { ...plan, items: [{ description: 'Crown', estimate: '12,000' }] }))).toBe('VALIDATION_FAILED');
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, { ...plan, items: [{ description: 'Crown', treatmentKey: 'no-such-treatment', estimate: '100' }] }))).toBe('VALIDATION_FAILED');
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, { ...plan, items: [{ description: 'Crown', teeth: '19', estimate: '100' }] }))).toBe('VALIDATION_FAILED');
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, { ...plan, items: [] }))).toBe('VALIDATION_FAILED');

    const { planId } = await proposePlan(p.dentist, p.organizationId, patient.userId, plan);
    const saved = await testDb().treatmentPlan.findUniqueOrThrow({ where: { id: planId }, include: { items: { orderBy: { position: 'asc' } } } });
    expect(saved).toMatchObject({ status: 'PROPOSED', currency: 'INR', estimateMinor: 1450050n, authorUserId: p.dentist.userId });
    expect(saved.items.map((i) => [i.position, i.teeth, i.estimateMinor, i.treatmentKey])).toEqual([[1, [16], 650000n, treatmentKey], [2, [16], 800050n, null]]);
    expect((await myRecord(patient)).treatmentPlans.map((t) => t.id)).toEqual([planId]);
    const told = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: patient.userId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001' }, orderBy: { createdAt: 'desc' } });
    expect(told.body).toContain('proposed a treatment plan');
    expect(told.body).not.toContain('Root canal');

    // Progress only once the patient has accepted.
    expect(await code(actOnPlanItem(p.dentist, planId, saved.items[0]!.id, { status: 'DONE' }))).toBe('PRECONDITION_FAILED');
    // Only this patient decides; another practice cannot withdraw it.
    expect(await code(decidePlan(stranger, planId, { decision: 'ACCEPT' }))).toBe('NOT_FOUND');
    expect(await code(cancelPlan(other.admin, planId, { reason: 'Not ours to withdraw.' }))).toBe('NOT_FOUND');

    expect(await decidePlan(patient, planId, { decision: 'ACCEPT' })).toEqual({ status: 'ACCEPTED' });
    expect(await code(decidePlan(patient, planId, { decision: 'DECLINE' }))).toBe('CONFLICT');
    expect(await testDb().inAppNotification.count({ where: { notificationId: 'TL-NOTIF-TREATMENT-PLAN-001', userId: p.admin.userId } })).toBe(1);

    expect(await code(actOnPlanItem(p.dentist, planId, saved.items[1]!.id, { status: 'SKIPPED' }))).toBe('VALIDATION_FAILED');
    expect(await actOnPlanItem(p.dentist, planId, saved.items[0]!.id, { status: 'DONE' })).toEqual({ completed: false });
    expect(await code(actOnPlanItem(p.dentist, planId, saved.items[0]!.id, { status: 'DONE' }))).toBe('CONFLICT');
    expect(await actOnPlanItem(p.dentist, planId, saved.items[1]!.id, { status: 'SKIPPED', reason: 'Patient chose a bridge elsewhere.' })).toEqual({ completed: true });
    const done = await testDb().treatmentPlan.findUniqueOrThrow({ where: { id: planId } });
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();
    expect(await code(cancelPlan(p.dentist, planId, { reason: 'Too late to withdraw.' }))).toBe('CONFLICT');

    // A second plan, withdrawn with a reason the patient sees; it can no longer be decided.
    const second = await proposePlan(p.dentist, p.organizationId, patient.userId, { title: 'Whitening', items: [{ description: 'In-office whitening', estimate: '4000' }] });
    await cancelPlan(p.dentist, second.planId, { reason: 'Proposed by mistake.' });
    expect(await testDb().treatmentPlan.findUniqueOrThrow({ where: { id: second.planId } })).toMatchObject({ status: 'CANCELLED', cancelledReason: 'Proposed by mistake.' });
    expect(await code(decidePlan(patient, second.planId, { decision: 'ACCEPT' }))).toBe('CONFLICT');

    // "Who looked" names the practice's plan actions, not the patient's own.
    expect((await accessHistory(patient.userId)).map((h) => h.what)).toEqual(expect.arrayContaining(['proposed a treatment plan', 'recorded progress on a treatment plan', 'withdrew a treatment plan']));

    // Access ends: the practice can no longer act; the patient still has both plans.
    await revokeGrant(patient, grantId);
    expect(await code(proposePlan(p.dentist, p.organizationId, patient.userId, plan))).toBe('NOT_FOUND');
    expect((await myRecord(patient)).treatmentPlans).toHaveLength(2);
    const exported = (await exportUserData(patient.userId)).sections as Record<string, Array<{ estimateMinor: string }>>;
    expect(exported.treatmentPlans!.map((t) => t.estimateMinor)).toEqual(['1450050', '400000']);
  });

  it('completes exactly once when the last two treatments are recorded at the same moment', async () => {
    const p = await practice('tp-c');
    const patient = principal(await user('ravi'), ['patient']);
    await book(p, patient);
    await grantAccess(patient, { organizationId: p.organizationId, canWrite: true, days: '30' });
    const { planId } = await proposePlan(p.dentist, p.organizationId, patient.userId, { title: 'Fillings', items: [{ description: 'Filling', teeth: '36', estimate: '1200' }, { description: 'Filling', teeth: '46', estimate: '1200' }] });
    await decidePlan(patient, planId, { decision: 'ACCEPT' });
    const items = await testDb().treatmentPlanItem.findMany({ where: { planId }, orderBy: { position: 'asc' } });
    const results = await Promise.all(items.map((i) => actOnPlanItem(p.dentist, planId, i.id, { status: 'DONE' })));
    expect(results.filter((r) => r.completed)).toHaveLength(1);
    expect((await testDb().treatmentPlan.findUniqueOrThrow({ where: { id: planId } })).status).toBe('COMPLETED');
  });
});
