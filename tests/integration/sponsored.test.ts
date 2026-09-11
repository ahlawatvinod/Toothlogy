/**
 * TL-TEST-SPONSORED-001 — Prime / Sponsored placement against the real database.
 *
 * Campaign validation and ownership; the budget held through the wallet
 * ledger, one charge per running day, refunds on cancel / end / exhaustion;
 * serving only valid, targeted, bookable campaigns in separate slots while
 * organic search results stay identical; clicks counted once and own-team
 * activity excluded; lead attribution; tenant isolation.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment } from '@/platform/appointments/service';
import { accountStatement, creditWallet, verifyLedgerIntegrity } from '@/platform/billing/service';
import { accrueCampaign, actOnCampaign, createCampaign, getCampaign, listAllCampaigns, listCampaigns, updateCampaign } from '@/platform/sponsored/service';
import { attributedCampaign, recordSponsoredClick, recordSponsoredFollowUp, sponsoredForSearch } from '@/platform/sponsored/serve';
import { reindexAll } from '@/platform/discovery/indexer';
import { runSearch } from '@/platform/search/service';
import { TREATMENTS } from '@/platform/catalogue/treatments';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { relayOutbox } from '@/platform/events/outbox';
import { addDays } from '@/lib/zoned-time';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TZ = 'Asia/Kolkata';
const RAIPUR = { latitude: 21.2514, longitude: 81.6296 };
const DELHI = { latitude: 28.6139, longitude: 77.209 };
/** The seeded minimum daily budget (₹100, GST included). */
const MIN_DAY = 10_000;
const RECHARGE = 118_000;

function principal(userId: string, organizations: AuthenticatedPrincipal['organizations'] = [], roles: string[] = ['patient']): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient') {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: label, role, acceptedTerms: true });
  await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function practice(slug: string, point = RAIPUR) {
  const reviewerId = await user('reviewer');
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: reviewerId, roleKey: 'moderator' } });
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(
    organizationId,
    { name: 'Main', slug: 'main', timezone: TZ, isPrimary: true, ...point, hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAtMinutes: 540, closesAtMinutes: 1020 })) },
    ownerId,
  );
  await testDb().location.update({ where: { id: locationId }, data: { observesPublicHolidays: false, chairs: 2 } });
  const dentistUserId = await user(`dr-${slug}`, 'dentist');
  await upsertDentistProfile(dentistUserId, {
    slug: `dr-${slug}`,
    bio: 'A practising dentist with more than ten years of clinical experience in general and restorative dentistry.',
    languages: ['en', 'hi'],
    specialtyKeys: ['general_dentistry'],
  });
  await addQualification(dentistUserId, { degree: 'BDS', institution: 'Government Dental College', year: 2012, registrationNumber: `DCI-${slug}`, registrationBody: 'Dental Council of India' });
  const { verificationRequestId } = await submitForVerification(dentistUserId);
  await reviewVerification({ verificationRequestId, decision: 'APPROVED' }, reviewerId);
  const { practiceId } = await claimPractice(dentistUserId, locationId);
  await confirmPractice(practiceId, organizationId, ownerId);
  await testDb().dentistPractice.update({ where: { id: practiceId }, data: { autoConfirm: true, minNoticeMinutes: 60 } });
  return {
    ownerId,
    organizationId,
    practiceId,
    dentistUserId,
    admin: principal(ownerId, [{ organizationId, roles: ['clinic_admin'] }], ['dentist']),
    dentist: principal(dentistUserId, [], ['dentist']),
  };
}

const staff = async () => principal(await user('staff'), [], ['platform_admin']);
const fund = async (organizationId: string, amount = RECHARGE) =>
  creditWallet(await staff(), { organizationId, amountMinor: BigInt(amount), externalReference: `NEFT-${organizationId}-${amount}` }, { idempotencyKey: `fund-${organizationId}-${amount}-${seq}` });
const today = () => localDateOf(new Date(), TZ);
const walletOf = (organizationId: string) => testDb().wallet.findUniqueOrThrow({ where: { organizationId } });
const searchNearRaipur = (viewerUserId: string | null = null, extra: { treatment?: string | null; appointmentType?: 'CLINIC' | 'VIDEO' | 'HOME_VISIT'; point?: typeof RAIPUR | null } = {}) =>
  sponsoredForSearch({ type: 'dentist', point: extra.point === undefined ? RAIPUR : extra.point, treatment: extra.treatment ?? null, appointmentType: extra.appointmentType ?? 'CLINIC', viewerUserId });

function draft(s: Awaited<ReturnType<typeof practice>>, overrides: Record<string, unknown> = {}) {
  return createCampaign(s.admin, s.organizationId, {
    name: 'Prime week',
    subjectType: 'PRACTICE',
    practiceId: s.practiceId,
    startDate: today(),
    endDate: addDays(today(), 2),
    budgetMinor: BigInt(3 * MIN_DAY),
    ...overrides,
  });
}

describeIntegration('sponsored placement (integration)', () => {
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
    resetPlatformSubscribers();
    await disconnectTestDb();
  });

  it('validates a campaign, refuses duplicates, and activation holds the budget and charges day one', async () => {
    const s = await practice('prime');
    const other = await practice('prime-other');
    await fund(s.organizationId);

    await expect(draft(s, { startDate: addDays(today(), -1) })).rejects.toThrow(/start date has passed/);
    await expect(draft(s, { endDate: addDays(today(), -1) })).rejects.toThrow(/end on or after/);
    await expect(draft(s, { budgetMinor: BigInt(3 * MIN_DAY - 1) })).rejects.toThrow(/at least/);
    await expect(draft(s, { targetTreatmentKeys: ['not_a_treatment'] })).rejects.toThrow(/Unknown treatment/);
    await expect(draft(s, { practiceId: other.practiceId })).rejects.toThrow(/not found/i);
    await expect(draft(s, { subjectType: 'ORGANIZATION', practiceId: null })).rejects.toThrow(/verified clinic/);
    await expect(draft(s, { searchPlacement: false, profilePlacement: false })).rejects.toThrow(/at least one placement/);

    const campaign = await draft(s);
    expect(campaign.status).toBe('DRAFT');
    expect(await testDb().ledgerEntry.count({ where: { campaignId: campaign.id } })).toBe(0);
    await expect(draft(s, { name: 'Same thing again' })).rejects.toThrow(/already promotes/);

    const active = await actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' });
    expect([active.status, active.heldMinor, active.dailyRateMinor, active.spentMinor]).toEqual(['ACTIVE', BigInt(30_000), BigInt(10_000), BigInt(10_000)]);
    const hold = await testDb().ledgerEntry.findFirstOrThrow({ where: { campaignId: campaign.id, kind: 'SPONSORED_HOLD' } });
    expect([hold.amountMinor, hold.idempotencyKey]).toEqual([BigInt(-30_000), `campaign-hold:${campaign.id}:1`]);
    // GST kept apart from the amount: 30,000 gross = 25,424 net + 4,576 tax at 18%.
    expect([hold.netMinor, hold.taxMinor]).toEqual([BigInt(-25_424), BigInt(-4_576)]);
    expect((await walletOf(s.organizationId)).balanceMinor).toBe(BigInt(RECHARGE - 30_000));

    // The day is charged once, however often the accrual runs.
    const runs = await Promise.all([1, 2, 3, 4, 5].map(() => accrueCampaign(campaign.id)));
    expect(runs.every((r) => r === 'ALREADY')).toBe(true);
    expect(await testDb().sponsoredCampaignDay.count({ where: { campaignId: campaign.id } })).toBe(1);
    expect((await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).spentMinor).toBe(BigInt(10_000));
    await expect(actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' })).rejects.toThrow(/cannot be activated/);
  });

  it('refuses activation when the wallet cannot cover the budget, and never goes negative', async () => {
    const s = await practice('broke');
    const campaign = await draft(s);
    await expect(actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' })).rejects.toThrow(/Recharge first/);
    expect((await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe('DRAFT');
    expect(await testDb().ledgerEntry.count()).toBe(0);
    expect((await testDb().wallet.findUnique({ where: { organizationId: s.organizationId } }))?.balanceMinor ?? BigInt(0)).toBe(BigInt(0));

    // Only one of several simultaneous activations can hold the budget.
    await fund(s.organizationId);
    const results = await Promise.allSettled([1, 2, 3].map(() => actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await testDb().ledgerEntry.count({ where: { kind: 'SPONSORED_HOLD' } })).toBe(1);
    expect((await verifyLedgerIntegrity((await walletOf(s.organizationId)).id)).ok).toBe(true);
  });

  it('shows only valid, targeted, bookable campaigns in their own slots, and leaves organic results untouched', async () => {
    const s = await practice('shown');
    await practice('organic-only');
    await fund(s.organizationId);
    await reindexAll();
    const organic = async () => (await runSearch({ type: 'dentist', geo: { centre: RAIPUR, radiusMetres: 25_000 }, limit: 20 })).hits.map((h) => [h.id, h.score, h.promoted]);
    const before = await organic();
    expect(before.length).toBe(2);

    const campaign = await draft(s, { targetRadiusKm: 10 });
    expect(await searchNearRaipur()).toEqual([]); // a draft is never shown
    await actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' });

    const [slot, ...rest] = await searchNearRaipur();
    expect(rest).toEqual([]);
    expect(slot).toMatchObject({ campaignId: campaign.id, label: 'Sponsored', tier: 'Prime dentist', title: 'dr-shown' });
    expect(slot!.href).toBe(`/api/v1/sponsored/click/${slot!.impressionId}`);
    expect(slot!.next).not.toBeNull();
    // Organic results are exactly what they were: same ids, scores and order, none promoted.
    expect(await organic()).toEqual(before);

    // Location targeting: not for a search in Delhi, nor one with no place.
    expect(await searchNearRaipur(null, { point: DELHI })).toEqual([]);
    expect(await searchNearRaipur(null, { point: null })).toEqual([]);
    // Appointment-type and treatment targeting.
    await updateCampaign(s.admin, campaign.id, { targetAppointmentTypes: ['VIDEO'] });
    expect(await searchNearRaipur()).toEqual([]);
    await updateCampaign(s.admin, campaign.id, { targetAppointmentTypes: [], targetTreatmentKeys: [TREATMENTS[0]!.key] });
    expect(await searchNearRaipur()).toEqual([]);
    expect(await searchNearRaipur(null, { treatment: TREATMENTS[0]!.key })).toHaveLength(1);
    await updateCampaign(s.admin, campaign.id, { targetTreatmentKeys: [] });

    // Not bookable (paused bookings): not shown.
    await testDb().dentistPractice.update({ where: { id: s.practiceId }, data: { bookingPaused: true } });
    expect(await searchNearRaipur()).toEqual([]);
    await testDb().dentistPractice.update({ where: { id: s.practiceId }, data: { bookingPaused: false } });

    // Paused: not shown; resumed: shown again.
    await actOnCampaign(s.admin, campaign.id, { action: 'PAUSE' });
    expect(await searchNearRaipur()).toEqual([]);
    await actOnCampaign(s.admin, campaign.id, { action: 'RESUME' });
    expect(await searchNearRaipur()).toHaveLength(1);

    // Expired: closed by the accrual, refunded, not shown.
    const row = await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(await accrueCampaign(campaign.id, new Date(row.endsAt.getTime() + 60_000))).toBe('CLOSED');
    expect((await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe('ENDED');
    expect(await searchNearRaipur()).toEqual([]);
    expect(await organic()).toEqual(before);
  });

  it('counts a click once per impression, excludes the practice’s own activity, and attributes the booking lead', async () => {
    const s = await practice('clicks');
    const other = await practice('clicks-other', DELHI);
    await fund(s.organizationId);
    const campaign = await draft(s);
    await actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' });
    const patientId = await user('clicker');

    const [shown] = await searchNearRaipur(patientId);
    const first = await recordSponsoredClick(shown!.impressionId, patientId);
    const again = await recordSponsoredClick(shown!.impressionId, patientId);
    expect(again.clickId).toBe(first.clickId);
    expect(first.location).toBe(`/dentists/dr-clicks?sp=${first.clickId}&practice=${s.practiceId}`);
    await recordSponsoredFollowUp(first.clickId!, 'PROFILE_VIEW', patientId);
    await recordSponsoredFollowUp(first.clickId!, 'PROFILE_VIEW', patientId);
    await recordSponsoredFollowUp(first.clickId!, 'BOOK_CLICK', patientId);

    // The practice's own owner: recorded, but excluded, and never attributed.
    const [own] = await searchNearRaipur(s.ownerId);
    expect(own!.excluded).toBe(true);
    const ownClick = await recordSponsoredClick(own!.impressionId, s.ownerId);
    expect(await attributedCampaign(ownClick.clickId, s.practiceId)).toBeNull();
    // A click for this practice does not attribute a booking elsewhere.
    expect(await attributedCampaign(first.clickId, other.practiceId)).toBeNull();
    // A click on an impression more than a day old is not counted.
    const [late] = await searchNearRaipur(patientId);
    const stale = await recordSponsoredClick(late!.impressionId, patientId, new Date(Date.now() + 25 * HOUR));
    expect((await testDb().sponsoredEvent.findUniqueOrThrow({ where: { id: stale.clickId! } })).excludedReason).toBe('STALE_IMPRESSION');

    const date = localDateOf(new Date(Date.now() + 2 * DAY), TZ);
    const { slots } = await availableSlots({ practiceId: s.practiceId, type: 'CLINIC', fromDate: date, toDate: date });
    const { appointment } = await bookAppointment(principal(patientId), { practiceId: s.practiceId, startsAt: slots[0]!.startsAt, sponsoredClickId: first.clickId! });
    const lead = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
    expect(lead.campaignId).toBe(campaign.id);
    expect(appointment.bookingMetadata).toMatchObject({ campaignId: campaign.id, sponsoredClickId: first.clickId });
    await relayOutbox({ batchSize: 200 });
    // The lead is billed like any lead (the seeded first-30-free rule), not by the campaign.
    expect((await testDb().lead.findUniqueOrThrow({ where: { id: lead.id } })).billingStatus).toBe('FREE');

    const { analytics } = await getCampaign(s.admin, campaign.id);
    expect(analytics).toMatchObject({ impressions: 2, clicks: 1, profileViews: 1, bookingClicks: 1, leads: 1, conversions: 0, spentMinor: BigInt(10_000), costPerLeadMinor: BigInt(10_000) });
    expect(analytics.excludedEvents).toBeGreaterThanOrEqual(3); // own impression and click, stale click
  });

  it('refunds unspent budget exactly once on cancel, end or exhaustion, and never overruns', async () => {
    const s = await practice('refunds');
    await fund(s.organizationId);
    const start = (await walletOf(s.organizationId)).balanceMinor;

    // Cancel after day one: 30,000 held, 10,000 spent, 20,000 back — once.
    const cancelled = await draft(s);
    await actOnCampaign(s.admin, cancelled.id, { action: 'ACTIVATE' });
    await actOnCampaign(s.admin, cancelled.id, { action: 'CANCEL', reason: 'Clinic closed for renovation' });
    await expect(actOnCampaign(s.admin, cancelled.id, { action: 'CANCEL' })).rejects.toThrow(/already cancelled/);
    const refunds = await testDb().ledgerEntry.findMany({ where: { campaignId: cancelled.id, kind: 'SPONSORED_REFUND' } });
    expect(refunds.map((r) => r.amountMinor)).toEqual([BigInt(20_000)]);
    expect((await walletOf(s.organizationId)).balanceMinor).toBe(start - BigInt(10_000));

    // A one-day campaign at the minimum is exhausted on its first day: nothing to refund.
    const oneDay = await draft(s, { name: 'One day', endDate: today(), budgetMinor: BigInt(MIN_DAY) });
    const exhausted = await actOnCampaign(s.admin, oneDay.id, { action: 'ACTIVATE' });
    const afterOneDay = await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: exhausted.id } });
    expect([afterOneDay.status, afterOneDay.spentMinor, afterOneDay.refundedMinor]).toEqual(['EXHAUSTED', BigInt(MIN_DAY), BigInt(0)]);
    expect(await testDb().ledgerEntry.count({ where: { campaignId: oneDay.id, kind: 'SPONSORED_REFUND' } })).toBe(0);

    // Ends: a two-day campaign closed after its end date refunds the second day it never ran.
    const twoDay = await draft(s, { name: 'Two days', endDate: addDays(today(), 1), budgetMinor: BigInt(2 * MIN_DAY + 1) });
    await actOnCampaign(s.admin, twoDay.id, { action: 'ACTIVATE' });
    const row = await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: twoDay.id } });
    await Promise.all([1, 2, 3].map(() => accrueCampaign(twoDay.id, new Date(row.endsAt.getTime() + 1000))));
    const ended = await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: twoDay.id } });
    expect([ended.status, ended.spentMinor, ended.refundedMinor]).toEqual(['ENDED', BigInt(MIN_DAY), BigInt(MIN_DAY + 1)]);
    expect(await testDb().ledgerEntry.count({ where: { campaignId: twoDay.id, kind: 'SPONSORED_REFUND' } })).toBe(1);

    // The database refuses spend beyond what was held, whatever the code does.
    await expect(testDb().$executeRaw`UPDATE "sponsored_campaigns" SET "spentMinor" = "heldMinor" + 1 WHERE "id" = ${twoDay.id}`).rejects.toThrow(/sponsored_campaigns_money/);
    expect((await verifyLedgerIntegrity((await walletOf(s.organizationId)).id)).ok).toBe(true);

    // The statement shows sponsored spend apart from leads, and still reconciles.
    const statement = await accountStatement(s.admin, s.organizationId, today(), today());
    expect(statement.sponsored).toMatchObject({ holds: 3, heldMinor: BigInt(30_000 + MIN_DAY + 2 * MIN_DAY + 1), returnedMinor: BigInt(20_000 + MIN_DAY + 1) });
    expect(statement.sponsored.netMinor).toBe(BigInt(3 * MIN_DAY));
    expect(statement.reconciles).toBe(true);
  });

  it('only adds budget to a running campaign, holding the increase at once', async () => {
    const s = await practice('topup');
    await fund(s.organizationId);
    const campaign = await draft(s);
    await actOnCampaign(s.admin, campaign.id, { action: 'ACTIVATE' });
    await expect(updateCampaign(s.admin, campaign.id, { budgetMinor: BigInt(20_000) })).rejects.toThrow(/only be increased/);
    await expect(updateCampaign(s.admin, campaign.id, { endDate: addDays(today(), 5) })).rejects.toThrow(/fixed once a campaign is running/);
    const raised = await updateCampaign(s.admin, campaign.id, { budgetMinor: BigInt(40_000) });
    expect([raised.budgetMinor, raised.heldMinor, raised.holdCount]).toEqual([BigInt(40_000), BigInt(40_000), 2]);
    const holds = await testDb().ledgerEntry.findMany({ where: { campaignId: campaign.id, kind: 'SPONSORED_HOLD' }, orderBy: { createdAt: 'asc' } });
    expect(holds.map((h) => [h.amountMinor, h.idempotencyKey])).toEqual([
      [BigInt(-30_000), `campaign-hold:${campaign.id}:1`],
      [BigInt(-10_000), `campaign-hold:${campaign.id}:2`],
    ]);
    // 30,000 left over the two remaining days.
    expect(raised.dailyRateMinor).toBe(BigInt(15_000));
  });

  it('keeps campaigns inside their organization: no cross-tenant read, action or activation', async () => {
    const s = await practice('tenant-a');
    const other = await practice('tenant-b', DELHI);
    await fund(s.organizationId);
    const campaign = await draft(s);
    const patient = principal(await user('nosy'));

    for (const outsider of [other.admin, other.dentist, s.dentist, patient]) {
      await expect(getCampaign(outsider, campaign.id)).rejects.toThrow(/not found/i);
      await expect(actOnCampaign(outsider, campaign.id, { action: 'ACTIVATE' })).rejects.toThrow(/not found/i);
      await expect(updateCampaign(outsider, campaign.id, { budgetMinor: BigInt(1) })).rejects.toThrow(/not found/i);
      await expect(listCampaigns(outsider, s.organizationId)).rejects.toThrow(/not found/i);
      await expect(createCampaign(outsider, s.organizationId, { name: 'Hijack', subjectType: 'PRACTICE', practiceId: s.practiceId, startDate: today(), endDate: today(), budgetMinor: BigInt(MIN_DAY) })).rejects.toThrow(/not found/i);
    }
    await expect(listAllCampaigns(s.admin)).rejects.toThrow(/permission|forbidden/i);
    expect((await testDb().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe('DRAFT');
    expect(await testDb().ledgerEntry.count({ where: { kind: 'SPONSORED_HOLD' } })).toBe(0);

    // Toothlogy staff can see and act on every campaign, under the same rules.
    const admin = await staff();
    expect((await listAllCampaigns(admin)).map((c) => c.id)).toContain(campaign.id);
    await actOnCampaign(admin, campaign.id, { action: 'ACTIVATE' });
    expect((await testDb().auditEvent.findMany({ where: { subject: campaign.id } })).map((a) => a.action)).toEqual(
      expect.arrayContaining(['CAMPAIGN_CREATED', 'CAMPAIGN_ACTIVATE']),
    );
  });
});
