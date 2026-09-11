/**
 * TL-TEST-EQUIPMENT-001 — equipment register, maintenance contracts, visits
 * and reminders.
 *
 * The practice's administrators keep the register (staff read it); serial
 * numbers unique per practice; warranty after purchase; suppliers must be
 * businesses. Contracts only from a business the practice has traded with,
 * accepted or declined by the practice only, covering only its own
 * equipment; preventive visits bounded by those included (cancelled ones
 * given back), breakdown calls need the problem; the business schedules and
 * completes, the practice cancels. Reminders once per end date; contracts
 * past their end marked ended. Tenant isolation throughout.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { actOnContract, actOnVisit, addAsset, equipmentConsole, proposeContract, providerContracts, requestVisit, sendEquipmentReminders, updateAsset } from '@/platform/equipment/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function organization(slug: string, type: 'SUPPLIER' | 'CLINIC') {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `${type} ${slug}`, slug, type, countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    ownerId,
    admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

describeIntegration('Equipment and maintenance contracts', () => {
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
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('keeps a practice’s register for its administrators, readable by its staff', async () => {
    const clinic = await organization('smileclinic', 'CLINIC');
    const supplier = await organization('chairco', 'SUPPLIER');
    const chair = { name: 'Dental chair', category: 'equipment' as const, brand: 'Confident', model: 'Supreme', serialNumber: 'SN-100', purchasedOn: iso(-200), warrantyUntil: iso(165) };

    await expect(addAsset(clinic.staff, clinic.organizationId, chair)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(addAsset(outsider, clinic.organizationId, chair)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(addAsset(clinic.admin, clinic.organizationId, { ...chair, warrantyUntil: iso(-300) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(addAsset(clinic.admin, clinic.organizationId, { ...chair, purchasedOn: iso(10) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(addAsset(clinic.admin, clinic.organizationId, { ...chair, supplierOrganizationId: clinic.organizationId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(addAsset(clinic.admin, clinic.organizationId, { ...chair, category: 'toys' as never })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const { assetId } = await addAsset(clinic.admin, clinic.organizationId, { ...chair, supplierOrganizationId: supplier.organizationId });
    await expect(addAsset(clinic.admin, clinic.organizationId, { ...chair, name: 'Second chair' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await addAsset(clinic.admin, clinic.organizationId, { name: 'Autoclave', category: 'sterilization' });

    const console = await equipmentConsole(clinic.staff, clinic.organizationId);
    expect(console.canManage).toBe(false);
    expect(console.assets.map((a) => a.name).sort()).toEqual(['Autoclave', 'Dental chair']);
    await expect(equipmentConsole(supplier.admin, clinic.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(updateAsset(clinic.staff, assetId, { status: 'RETIRED' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await updateAsset(clinic.admin, assetId, { notes: 'Upholstery replaced 2026', status: 'RETIRED' });
    expect(await testDb().equipmentAsset.findUniqueOrThrow({ where: { id: assetId } })).toMatchObject({ status: 'RETIRED', notes: 'Upholstery replaced 2026' });
  });

  it('lets a business propose only to practices it has traded with; the practice decides and picks what is covered', async () => {
    const clinic = await organization('careclinic', 'CLINIC');
    const provider = await organization('servicepro', 'SUPPLIER');
    const stranger = await organization('coldcaller', 'SUPPLIER');
    const other = await organization('otherclinic', 'CLINIC');
    const proposal = { kind: 'AMC' as const, clientOrganizationId: clinic.organizationId, startsOn: iso(0), endsOn: iso(365), visitsIncluded: 2, responseHours: 24, priceMinor: '1800000', terms: 'Two preventive visits; breakdown calls within 24 hours.' };

    await expect(proposeContract(stranger.admin, stranger.organizationId, proposal)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    // A practice is not a service business, even though its administrators' role could manage one.
    await expect(proposeContract(clinic.admin, clinic.organizationId, { ...proposal, clientOrganizationId: other.organizationId })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const { assetId } = await addAsset(clinic.admin, clinic.organizationId, { name: 'X-ray unit', category: 'imaging', supplierOrganizationId: provider.organizationId });
    const { assetId: foreign } = await addAsset(other.admin, other.organizationId, { name: 'Their chair', category: 'equipment' });
    expect((await providerContracts(provider.admin, provider.organizationId)).partners.map((p) => p.id)).toEqual([clinic.organizationId]);
    await expect(proposeContract(provider.admin, provider.organizationId, { ...proposal, endsOn: iso(-1) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(proposeContract(provider.admin, provider.organizationId, { ...proposal, endsOn: iso(1200) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(proposeContract(provider.staff, provider.organizationId, proposal)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { contractId } = await proposeContract(provider.admin, provider.organizationId, proposal);
    expect(await testDb().inAppNotification.count({ where: { userId: clinic.ownerId, notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001' } })).toBe(1);
    await expect(actOnContract(provider.admin, contractId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnContract(clinic.staff, contractId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnContract(outsider, contractId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnContract(clinic.admin, contractId, { action: 'ACCEPT', assetIds: [foreign] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnContract(clinic.admin, contractId, { action: 'ACCEPT', assetIds: [assetId] });
    const contract = await testDb().serviceContract.findUniqueOrThrow({ where: { id: contractId }, include: { assets: true } });
    expect(contract).toMatchObject({ status: 'ACTIVE', priceMinor: BigInt(1_800_000), currency: 'INR', decidedByUserId: clinic.ownerId });
    expect(contract.assets.map((a) => a.assetId)).toEqual([assetId]);
    expect(await testDb().inAppNotification.count({ where: { userId: provider.ownerId, notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001' } })).toBe(1);
    await expect(actOnContract(clinic.admin, contractId, { action: 'DECLINE', note: 'Too late' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // A second proposal is declined with a reason.
    const second = await proposeContract(provider.admin, provider.organizationId, { ...proposal, kind: 'CMC' });
    await expect(actOnContract(clinic.admin, second.contractId, { action: 'DECLINE', note: '' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnContract(clinic.admin, second.contractId, { action: 'DECLINE', note: 'We already have an AMC' });
    expect((await testDb().serviceContract.findUniqueOrThrow({ where: { id: second.contractId } })).status).toBe('DECLINED');
  });

  it('bounds preventive visits, needs the problem for a breakdown, and lets each side do its part', async () => {
    const clinic = await organization('visitclinic', 'CLINIC');
    const provider = await organization('visitpro', 'SUPPLIER');
    const { assetId } = await addAsset(clinic.admin, clinic.organizationId, { name: 'Compressor', category: 'equipment', supplierOrganizationId: provider.organizationId });
    const { assetId: uncovered } = await addAsset(clinic.admin, clinic.organizationId, { name: 'Suction', category: 'equipment' });
    const { contractId } = await proposeContract(provider.admin, provider.organizationId, { kind: 'AMC', clientOrganizationId: clinic.organizationId, startsOn: iso(-1), endsOn: iso(364), visitsIncluded: 2, priceMinor: '900000' });
    await expect(requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' }); // not accepted yet
    await actOnContract(clinic.admin, contractId, { action: 'ACCEPT', assetIds: [assetId] });

    await expect(requestVisit(provider.admin, contractId, { kind: 'PREVENTIVE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(requestVisit(clinic.staff, contractId, { kind: 'PREVENTIVE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(requestVisit(clinic.admin, contractId, { kind: 'BREAKDOWN', assetId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE', assetId: uncovered })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const first = await requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE', assetId });
    await requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE' });
    await expect(requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await requestVisit(clinic.admin, contractId, { kind: 'BREAKDOWN', assetId, issue: 'Compressor trips the breaker' });

    await expect(actOnVisit(clinic.admin, first.visitId, { action: 'SCHEDULE', scheduledFor: new Date(Date.now() + DAY).toISOString() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnVisit(outsider, first.visitId, { action: 'CANCEL', note: 'No thanks' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnVisit(provider.admin, first.visitId, { action: 'SCHEDULE', scheduledFor: new Date(Date.now() - 3 * DAY).toISOString() })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnVisit(provider.admin, first.visitId, { action: 'SCHEDULE', scheduledFor: new Date(Date.now() + DAY).toISOString() });
    await expect(actOnVisit(provider.admin, first.visitId, { action: 'COMPLETE', report: 'ok' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnVisit(provider.admin, first.visitId, { action: 'COMPLETE', report: 'Drained tank, replaced filter, checked pressure switch.' });
    expect(await testDb().serviceVisit.findUniqueOrThrow({ where: { id: first.visitId } })).toMatchObject({ status: 'COMPLETED', report: 'Drained tank, replaced filter, checked pressure switch.' });
    await expect(actOnVisit(clinic.admin, first.visitId, { action: 'CANCEL', note: 'Changed our mind' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Cancelling a preventive visit gives it back.
    const second = await testDb().serviceVisit.findFirstOrThrow({ where: { contractId, kind: 'PREVENTIVE', status: 'REQUESTED' } });
    await actOnVisit(clinic.admin, second.id, { action: 'CANCEL', note: 'Clinic closed that week' });
    await requestVisit(clinic.admin, contractId, { kind: 'PREVENTIVE' });

    // Cancelled by the business: no more visits.
    await actOnContract(provider.admin, contractId, { action: 'CANCEL', note: 'We no longer service this model' });
    await expect(requestVisit(clinic.admin, contractId, { kind: 'BREAKDOWN', issue: 'Leak' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await equipmentConsole(clinic.admin, clinic.organizationId)).contracts[0]!.visits).toHaveLength(4);
    // Only what succeeded is audited: 4 requests, then schedule, complete, cancel.
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'SERVICE_VISIT_' } } })).toBe(7);
  });

  it('reminds once before warranties and contracts end, and ends contracts past their date', async () => {
    const clinic = await organization('reminderclinic', 'CLINIC');
    const provider = await organization('reminderpro', 'SUPPLIER');
    const { assetId } = await addAsset(clinic.admin, clinic.organizationId, { name: 'Scaler', category: 'handpieces', warrantyUntil: iso(10), supplierOrganizationId: provider.organizationId });
    await addAsset(clinic.admin, clinic.organizationId, { name: 'Far warranty', category: 'equipment', warrantyUntil: iso(90) });
    const soon = await proposeContract(provider.admin, provider.organizationId, { kind: 'AMC', clientOrganizationId: clinic.organizationId, startsOn: iso(-20), endsOn: iso(12), visitsIncluded: 1, priceMinor: '100000' });
    await actOnContract(clinic.admin, soon.contractId, { action: 'ACCEPT' });
    const old = await proposeContract(provider.admin, provider.organizationId, { kind: 'AMC', clientOrganizationId: clinic.organizationId, startsOn: iso(-25), endsOn: iso(5), visitsIncluded: 1, priceMinor: '100000' });
    await actOnContract(clinic.admin, old.contractId, { action: 'ACCEPT' });
    await testDb().serviceContract.update({ where: { id: old.contractId }, data: { endsOn: new Date(Date.now() - 3 * DAY), expiryReminderAt: new Date() } });

    expect(await sendEquipmentReminders()).toEqual({ warranties: 1, contracts: 1, expired: 1 });
    expect(await sendEquipmentReminders()).toEqual({ warranties: 0, contracts: 0, expired: 0 });
    expect(await testDb().inAppNotification.count({ where: { userId: clinic.ownerId, notificationId: 'TL-NOTIF-EQUIPMENT-EXPIRY-001' } })).toBe(2);
    expect((await testDb().serviceContract.findUniqueOrThrow({ where: { id: old.contractId } })).status).toBe('EXPIRED');

    // A changed warranty date reminds again.
    await updateAsset(clinic.admin, assetId, { warrantyUntil: iso(20) });
    expect((await sendEquipmentReminders()).warranties).toBe(1);
  });
});
