/**
 * TL-TEST-PRIME-001 — Prime plans, periods, entitlements and renewal.
 *
 * Only staff shape plans; codes are unique; individual plans carry no
 * organization-only benefits; a plan goes on sale only with its tax
 * configured and is not edited once on sale. An organization's
 * administrators buy a period from the lead wallet: refused when the wallet
 * is short, charged once with tax, one current period. Bonus free leads come
 * after the standard allowance and are counted per period; the badge and
 * priority support follow the current period. At the end a period renews
 * from the wallet once, or ends (renewal off, wallet short). Individual plans
 * answer NOT_CONFIGURED.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { chargeLead, creditWallet } from '@/platform/billing/service';
import { openTicket, supportQueue } from '@/platform/support/service';
import {
  buyIndividualMembership,
  buyMembership,
  createPlan,
  entitlementsFor,
  listPlans,
  primeBadgeHolders,
  primeConsole,
  renewMemberships,
  setAutoRenew,
  updatePlan,
} from '@/platform/prime/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const TZ = 'Asia/Kolkata';
const DAY = 86_400_000;
const B = (n: number) => BigInt(n);
const rand = () => Math.random().toString(36).slice(2);

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

async function staffWith(role: 'platform_admin' | 'support_agent') {
  const id = await user(role);
  await testDb().roleAssignment.create({ data: { id: `ra_${rand()}`, userId: id, roleKey: role } });
  return principal(id, [role]);
}

async function practice(slug: string) {
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(organizationId, { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, latitude: 21.25, longitude: 81.63, hours: [] }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${rand()}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    locationId,
    ownerId,
    admin: principal(ownerId, ['dentist'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

describeIntegration('Prime membership', () => {
  let admin: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;
  let creditKey = 0;
  const credit = (organizationId: string, amountMinor: number) =>
    creditWallet(admin, { organizationId, amountMinor: B(amountMinor), externalReference: `NEFT-PRIME-${(creditKey += 1)}` }, { idempotencyKey: `credit-prime-${creditKey}-${organizationId}` });
  const onSale = async (overrides: Record<string, unknown> = {}) => {
    const { planId } = await createPlan(admin, { code: `prime-${rand()}`, name: 'Prime Clinic', audience: 'ORGANIZATION', countryCode: 'IN', priceMinor: '1000000', periodMonths: 12, bonusFreeLeads: 2, primeBadge: true, prioritySupport: true, ...overrides });
    await updatePlan(admin, planId, { action: 'ACTIVATE' });
    return planId;
  };

  beforeAll(async () => {
    await assertSeeded();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    admin = await staffWith('platform_admin');
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('lets only staff shape plans, and puts one on sale only with its tax configured', async () => {
    const base = { code: 'prime-clinic-annual', name: 'Prime Clinic', audience: 'ORGANIZATION' as const, countryCode: 'IN', priceMinor: '1000000', periodMonths: 12 as const, bonusFreeLeads: 2, primeBadge: true };
    await expect(createPlan(outsider, base)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(createPlan(admin, { ...base, code: 'X' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createPlan(admin, { ...base, periodMonths: 5 as never })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createPlan(admin, { ...base, code: 'prime-person', audience: 'INDIVIDUAL' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const { planId } = await createPlan(admin, base);
    await expect(createPlan(admin, base)).rejects.toMatchObject({ code: 'CONFLICT' });
    await updatePlan(admin, planId, { name: 'Prime Clinic Annual' });
    await updatePlan(admin, planId, { action: 'ACTIVATE' });
    await expect(updatePlan(admin, planId, { priceMinor: '1' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(updatePlan(admin, planId, { action: 'ACTIVATE' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    const listed = await listPlans(admin);
    expect(listed[0]).toMatchObject({ name: 'Prime Clinic Annual', status: 'ACTIVE', currency: 'INR' });
    expect(listed[0]!.price).toMatchObject({ netMinor: B(1_000_000), taxMinor: B(180_000), grossMinor: B(1_180_000) });
    await updatePlan(admin, planId, { action: 'RETIRE' });
    expect((await testDb().membershipPlan.findUniqueOrThrow({ where: { id: planId } })).status).toBe('RETIRED');

    // A market with no tax configured for platform fees cannot sell a plan.
    const elsewhere = await testDb().country.findFirst({ where: { code: { not: 'IN' } } });
    if (elsewhere && (await testDb().taxConfiguration.count({ where: { countryCode: elsewhere.code, category: 'platform_fees' } })) === 0) {
      const { planId: foreign } = await createPlan(admin, { ...base, code: 'prime-elsewhere', countryCode: elsewhere.code });
      await expect(updatePlan(admin, foreign, { action: 'ACTIVATE' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    }
    await expect(testDb().$executeRawUnsafe(`UPDATE "membership_plans" SET "audience" = 'INDIVIDUAL' WHERE "id" = '${planId}'`)).rejects.toThrow();
  });

  it('sells a period from the lead wallet — once, with tax — to administrators only', async () => {
    const p = await practice('primeclinic');
    const planId = await onSale();
    const draft = (await createPlan(admin, { code: 'prime-draft', name: 'Draft plan', audience: 'ORGANIZATION', countryCode: 'IN', priceMinor: '100', periodMonths: 1 })).planId;

    const console = await primeConsole(p.admin, p.organizationId);
    expect(console.current).toBeNull();
    expect(console.offers.map((o) => o.plan.id)).toEqual([planId]);
    expect(console.offers[0]!.price.grossMinor).toBe(B(1_180_000));
    await expect(primeConsole(p.staff, p.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(buyMembership(p.staff, p.organizationId, { planId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(buyMembership(p.admin, p.organizationId, { planId: draft })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(buyMembership(p.admin, p.organizationId, { planId })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await testDb().membership.count()).toBe(0);

    await credit(p.organizationId, 2_000_000);
    const bought = await buyMembership(p.admin, p.organizationId, { planId });
    expect(bought.grossMinor).toBe(B(1_180_000));
    await expect(buyMembership(p.admin, p.organizationId, { planId })).rejects.toMatchObject({ code: 'CONFLICT' });
    const wallet = await testDb().wallet.findUniqueOrThrow({ where: { organizationId: p.organizationId } });
    expect(wallet.balanceMinor).toBe(B(820_000));
    const entry = await testDb().ledgerEntry.findFirstOrThrow({ where: { walletId: wallet.id, kind: 'MEMBERSHIP_CHARGE' } });
    expect(entry).toMatchObject({ amountMinor: B(-1_180_000), netMinor: B(-1_000_000), taxMinor: B(-180_000), taxRateBasisPoints: 1800 });
    expect(await testDb().inAppNotification.count({ where: { userId: p.ownerId, notificationId: 'TL-NOTIF-MEMBERSHIP-001' } })).toBe(1);
    expect([...(await primeBadgeHolders([p.organizationId, 'org_nobody']))]).toEqual([p.organizationId]);
    expect((await primeConsole(p.admin, p.organizationId)).current?.membership.id).toBe(bought.membershipId);

    // An individual plan needs a payment provider: nothing is created without one.
    const { planId: personal } = await createPlan(admin, { code: 'prime-person', name: 'Prime Person', audience: 'INDIVIDUAL', countryCode: 'IN', priceMinor: '50000', periodMonths: 12, prioritySupport: true });
    await updatePlan(admin, personal, { action: 'ACTIVATE' });
    await expect(buyIndividualMembership(outsider, { planId: personal })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(await testDb().membership.count()).toBe(1);
  });

  it('gives bonus free leads after the standard allowance, counted per period', async () => {
    const p = await practice('bonusclinic');
    await testDb().leadPricingRule.create({
      data: { id: `lpr_${rand()}`, countryCode: 'IN', currency: 'INR', organizationId: p.organizationId, priceMinor: B(5000), freeLeadAllowance: 0, effectiveFrom: new Date(Date.now() - DAY) },
    });
    await credit(p.organizationId, 3_000_000);
    await buyMembership(p.admin, p.organizationId, { planId: await onSale() });
    const patientId = await user('patient');
    const lead = async () => {
      const id = `led_${rand()}`;
      await testDb().lead.create({ data: { id, patientUserId: patientId, organizationId: p.organizationId, locationId: p.locationId, source: 'CALLBACK_REQUEST', status: 'QUALIFIED', dedupeKey: id, qualifiedAt: new Date() } });
      return id;
    };
    const [a, b, c] = [await lead(), await lead(), await lead()];
    expect(await chargeLead(a)).toMatchObject({ status: 'FREE', ordinal: 1 });
    expect(await chargeLead(b)).toMatchObject({ status: 'FREE', ordinal: 2 });
    expect(await chargeLead(c)).toMatchObject({ status: 'CHARGED', ordinal: 3 });
    expect(await chargeLead(a)).toMatchObject({ status: 'FREE', replayed: true });
    const membership = await testDb().membership.findFirstOrThrow({ where: { organizationId: p.organizationId } });
    expect(await testDb().lead.count({ where: { membershipId: membership.id, billingStatus: 'FREE' } })).toBe(2);
    expect((await testDb().leadEvent.findFirstOrThrow({ where: { leadId: b, action: 'BILLED_FREE' } })).reason).toBe('Prime bonus lead 2 of 2 in this membership period.');
    expect((await entitlementsFor(p.organizationId))?.bonusUsed).toBe(2);
  });

  it('answers Prime priority-support tickets first', async () => {
    const p = await practice('supportclinic');
    const agent = await staffWith('support_agent');
    await openTicket(outsider, { category: 'ACCOUNT', subject: 'Cannot change my email', body: 'The form says my email is taken.' });
    await credit(p.organizationId, 2_000_000);
    await buyMembership(p.admin, p.organizationId, { planId: await onSale() });
    const { ticketId } = await openTicket(p.admin, { category: 'ACCOUNT', organizationId: p.organizationId, subject: 'Staff access', body: 'Please help us add a receptionist.' });
    expect((await testDb().supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).priority).toBe(true);
    const queue = await supportQueue(agent);
    expect(queue.map((t) => t.priority)).toEqual([true, false]);
    expect(queue[0]!.id).toBe(ticketId);
  });

  it('renews from the wallet once at the end, or lets the period end', async () => {
    const p = await practice('renewclinic');
    const planId = await onSale();
    await credit(p.organizationId, 5_000_000);
    const first = await buyMembership(p.admin, p.organizationId, { planId });
    // Move the period into the past (a period always ends after it starts).
    const ended = new Date(Date.now() - 60 * 60_000);
    await testDb().membership.update({ where: { id: first.membershipId }, data: { startsAt: new Date(ended.getTime() - 365 * DAY), endsAt: ended } });

    expect(await renewMemberships()).toEqual({ renewed: 1, ended: 0 });
    expect(await renewMemberships()).toEqual({ renewed: 0, ended: 0 });
    const old = await testDb().membership.findUniqueOrThrow({ where: { id: first.membershipId } });
    expect(old).toMatchObject({ status: 'ENDED', openKey: null });
    const next = await testDb().membership.findFirstOrThrow({ where: { renewedFromId: first.membershipId } });
    expect(next).toMatchObject({ status: 'ACTIVE', startsAt: ended, openKey: `org:${p.organizationId}` });
    expect(await testDb().ledgerEntry.count({ where: { kind: 'MEMBERSHIP_CHARGE', wallet: { organizationId: p.organizationId } } })).toBe(2);

    await expect(setAutoRenew(p.staff, next.id, { autoRenew: false })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await setAutoRenew(p.admin, next.id, { autoRenew: false });
    await testDb().membership.update({ where: { id: next.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await renewMemberships()).toEqual({ renewed: 0, ended: 1 });
    expect(await testDb().membership.findUniqueOrThrow({ where: { id: next.id } })).toMatchObject({ status: 'ENDED', endedReason: 'Auto-renew was off' });
    expect(await primeBadgeHolders([p.organizationId])).toEqual(new Set());

    // A wallet that cannot cover the renewal: the period ends, and says why.
    const short = await practice('shortclinic');
    await credit(short.organizationId, 1_180_000);
    const only = await buyMembership(short.admin, short.organizationId, { planId });
    await testDb().membership.update({ where: { id: only.membershipId }, data: { startsAt: new Date(Date.now() - 365 * DAY), endsAt: new Date(Date.now() - 1000) } });
    expect(await renewMemberships()).toEqual({ renewed: 0, ended: 1 });
    expect((await testDb().membership.findUniqueOrThrow({ where: { id: only.membershipId } })).endedReason).toMatch(/^Renewal failed/);
    expect(await testDb().membership.count({ where: { organizationId: short.organizationId, status: 'ACTIVE' } })).toBe(0);
    expect(await testDb().inAppNotification.count({ where: { userId: p.ownerId, notificationId: 'TL-NOTIF-MEMBERSHIP-001' } })).toBe(3); // started, renewed, ended
  });
});
