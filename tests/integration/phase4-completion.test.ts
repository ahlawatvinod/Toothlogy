/**
 * TL-TEST-PHASE4-COMPLETION-001 — tiered lead pricing, recharges, statements,
 * reminders, video, races, notifications and tenant isolation.
 *
 * Against the real database with the real outbox handlers. Prices, the free
 * allowance and the recharge minimum come from the seeded configuration
 * (₹50 + GST, first 30 free, 20-lead minimum); where a test needs a different
 * allowance it adds an organization-specific rule — the same configuration
 * dimension an operator would use — and never edits the seeded one.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import { bookAppointment, getAppointment, rescheduleAppointment, sendDueFollowUps, sendDueReminders, transition } from '@/platform/appointments/service';
import { setAvailabilityRules } from '@/platform/appointments/availability-admin';
import { actOnLead, leadStats, listLeads, requestCallback } from '@/platform/leads/service';
import {
  accountStatement,
  chargeLead,
  creditWallet,
  quoteLead,
  raiseDispute,
  rechargeQuote,
  resolveDispute,
  reverseEntry,
  startTopUp,
  verifyLedgerIntegrity,
  walletOverview,
} from '@/platform/billing/service';
import { provisionVideoMeeting, videoMeetingView } from '@/platform/video/service';
import { videoProvider, type VideoPort } from '@/platform/video/ports';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { relayOutbox } from '@/platform/events/outbox';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TZ = 'Asia/Kolkata';
const NET = BigInt(5_000);
const TAX = BigInt(900);
/** ₹50 + 18% GST. */
const GROSS = BigInt(5_900);
/** 20 paid leads, tax included: ₹1,180. */
const MIN = 20 * 5_900;

function principal(userId: string, organizations: AuthenticatedPrincipal['organizations'] = [], roles: string[] = ['patient']): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, role: 'dentist' | 'patient' = 'patient', verified = true) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: label, role, acceptedTerms: true });
  if (verified) await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function reviewer() {
  const userId = await user('reviewer');
  await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId, roleKey: 'moderator' } });
  return userId;
}

interface Settings {
  autoConfirm?: boolean;
  chairs?: number;
  acceptsVideo?: boolean;
  /** An organization-specific free allowance; omitted: the seeded 30. */
  freeLeads?: number;
}

async function practice(slug: string, settings: Settings = {}) {
  const reviewerId = await reviewer();
  const ownerId = await user(`owner-${slug}`, 'dentist');
  const { organizationId } = await createOrganization({ name: `Clinic ${slug}`, slug, type: 'CLINIC', countryCode: 'IN', timezone: TZ }, ownerId);
  const { locationId } = await createLocation(
    organizationId,
    {
      name: 'Main',
      slug: 'main',
      timezone: TZ,
      isPrimary: true,
      latitude: 21.2514,
      longitude: 81.6296,
      hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAtMinutes: 540, closesAtMinutes: 1020 })),
    },
    ownerId,
  );
  await testDb().location.update({ where: { id: locationId }, data: { observesPublicHolidays: false, chairs: settings.chairs ?? 2 } });
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
  await testDb().dentistPractice.update({
    where: { id: practiceId },
    data: { autoConfirm: settings.autoConfirm ?? true, acceptsVideo: settings.acceptsVideo ?? false, minNoticeMinutes: 60 },
  });
  if (settings.freeLeads !== undefined) {
    const base = await testDb().leadPricingRule.findFirstOrThrow({
      where: { countryCode: 'IN', organizationId: null, dentistProfileId: null, treatmentId: null, leadSource: null, isActive: true, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    await testDb().leadPricingRule.create({ data: { ...base, id: `lpr_t_${organizationId}`, organizationId, freeLeadAllowance: settings.freeLeads, createdAt: undefined } });
  }
  return {
    ownerId,
    organizationId,
    locationId,
    dentistUserId,
    practiceId,
    admin: principal(ownerId, [{ organizationId, roles: ['clinic_admin'] }], ['dentist']),
    dentist: principal(dentistUserId, [], ['dentist']),
  };
}

async function slotsFor(practiceId: string, daysAhead = 2, type: 'CLINIC' | 'VIDEO' = 'CLINIC') {
  const date = localDateOf(new Date(Date.now() + daysAhead * DAY), TZ);
  const { slots } = await availableSlots({ practiceId, type, fromDate: date, toDate: date });
  return slots;
}

const staff = async () => principal(await user('staff'), [], ['platform_admin']);
const relay = () => relayOutbox({ batchSize: 500 });
const credit = (organizationId: string, amountMinor: number, key: string, actor: AuthenticatedPrincipal) =>
  creditWallet(actor, { organizationId, amountMinor: BigInt(amountMinor), externalReference: `NEFT-${key}` }, { idempotencyKey: `credit-key-${key}-${organizationId}` });
const leadCharges = () => testDb().ledgerEntry.count({ where: { kind: 'LEAD_CHARGE' } });
const walletOf = (organizationId: string) => testDb().wallet.findUniqueOrThrow({ where: { organizationId } });
const today = () => localDateOf(new Date(), TZ);

describeIntegration('phase 4 completion (integration)', () => {
  beforeAll(async () => {
    await assertSeeded();
    resetPlatformSubscribers();
    registerPlatformSubscribers();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    videoProvider.set(null);
  });
  afterAll(async () => {
    videoProvider.set(null);
    resetPlatformSubscribers();
    await disconnectTestDb();
  });

  // -------------------------------------------------------------------------
  describe('tiered lead pricing', () => {
    it('makes the first 30 qualified leads free and charges ₹50 + GST from the 31st', async () => {
      const s = await practice('tiers');
      const quote = await quoteLead({ organizationId: s.organizationId, dentistProfileId: null, treatmentId: null, source: 'CALLBACK_REQUEST' });
      expect([quote.netMinor, quote.taxMinor, quote.grossMinor, quote.taxRateBasisPoints, quote.freeLeadAllowance]).toEqual([NET, TAX, GROSS, 1800, 30]);
      await credit(s.organizationId, MIN, 'tiers', await staff());

      const callers = await Promise.all(Array.from({ length: 32 }, (_, i) => user(`caller${i}`)));
      for (const id of callers) await requestCallback(principal(id), { practiceId: s.practiceId });

      const leads = await testDb().lead.findMany({ where: { organizationId: s.organizationId }, orderBy: { billingOrdinal: 'asc' } });
      expect(leads.map((l) => l.billingOrdinal)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
      const nth = (n: number) => leads[n - 1]!;
      for (const n of [1, 29, 30]) expect([n, nth(n).billingStatus, nth(n).priceMinor, nth(n).taxMinor]).toEqual([n, 'FREE', BigInt(0), BigInt(0)]);
      for (const n of [31, 32]) expect([n, nth(n).billingStatus, nth(n).priceMinor, nth(n).taxMinor]).toEqual([n, 'CHARGED', NET, TAX]);
      expect(leads.filter((l) => l.billingStatus === 'FREE')).toHaveLength(30);

      const charges = await testDb().ledgerEntry.findMany({ where: { kind: 'LEAD_CHARGE' }, orderBy: { createdAt: 'asc' } });
      expect(charges.map((c) => [c.amountMinor, c.netMinor, c.taxMinor, c.taxRateBasisPoints])).toEqual([
        [-GROSS, -NET, -TAX, 1800],
        [-GROSS, -NET, -TAX, 1800],
      ]);
      const wallet = await walletOf(s.organizationId);
      expect(wallet.balanceMinor).toBe(BigInt(MIN) - GROSS * BigInt(2));
      expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);
      expect(await testDb().outboxEvent.count({ where: { name: 'LEAD_BILLED' } })).toBe(32);

      // Free leads are delivered, contact included, exactly like paid ones.
      const listed = await listLeads(s.admin, s.organizationId);
      expect(listed.every((l) => l.status === 'DELIVERED' && l.patientEmail)).toBe(true);
      const stats = await leadStats(s.admin, s.organizationId);
      expect([stats.total, stats.free, stats.paid, stats.delivered, stats.spendGrossMinor, stats.gstMinor]).toEqual([32, 30, 2, 32, GROSS * BigInt(2), TAX * BigInt(2)]);
    });

    it('decides each ordinal once when leads qualify at the same moment across the boundary', async () => {
      const s = await practice('boundary', { freeLeads: 2 });
      await credit(s.organizationId, MIN, 'boundary', await staff());
      const callers = await Promise.all(Array.from({ length: 5 }, (_, i) => user(`racer${i}`)));
      await Promise.all(callers.map((id) => requestCallback(principal(id), { practiceId: s.practiceId })));

      const leads = await testDb().lead.findMany({ where: { organizationId: s.organizationId }, orderBy: { billingOrdinal: 'asc' } });
      expect(leads.map((l) => l.billingOrdinal)).toEqual([1, 2, 3, 4, 5]);
      expect(leads.map((l) => l.billingStatus)).toEqual(['FREE', 'FREE', 'CHARGED', 'CHARGED', 'CHARGED']);
      expect(await leadCharges()).toBe(3);
      expect((await verifyLedgerIntegrity((await walletOf(s.organizationId)).id)).ok).toBe(true);
    });

    it('never charges a duplicate, rejected, invalid or internal lead', async () => {
      const s = await practice('nocharge', { freeLeads: 0, autoConfirm: false });
      await credit(s.organizationId, MIN, 'nocharge', await staff());

      const repeat = principal(await user('repeat'));
      expect((await requestCallback(repeat, { practiceId: s.practiceId })).billingStatus).toBe('CHARGED');
      const duplicate = await requestCallback(repeat, { practiceId: s.practiceId });
      expect(duplicate.status).toBe('DUPLICATE');
      const invalid = await requestCallback(principal(await user('unverified', 'patient', false)), { practiceId: s.practiceId });
      expect(invalid.status).toBe('NOT_QUALIFIED');
      const insider = await user('insider');
      await testDb().roleAssignment.create({ data: { id: `ra_in_${insider}`, userId: insider, roleKey: 'support_agent' } });
      const internal = await requestCallback(principal(insider), { practiceId: s.practiceId });
      expect(internal).toMatchObject({ status: 'NOT_QUALIFIED', qualificationReason: expect.stringMatching(/Internal/) });

      const [slot] = await slotsFor(s.practiceId);
      const booked = await bookAppointment(principal(await user('declined')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await transition(s.dentist, booked.appointment.id, 'REJECT', { reason: 'Not available that day' });
      await relay();
      const rejected = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: booked.appointment.id } });
      expect([rejected.status, rejected.billingStatus]).toEqual(['LOST', 'NOT_BILLABLE']);

      for (const { id } of [duplicate, invalid, internal, rejected]) {
        const lead = await testDb().lead.findUniqueOrThrow({ where: { id } });
        expect([lead.billingStatus, lead.billingOrdinal]).toEqual(['NOT_BILLABLE', null]);
      }
      expect(await leadCharges()).toBe(1);
    });

    it('holds a paid lead for funds and charges it exactly once when credits and retries race', async () => {
      const s = await practice('pending', { freeLeads: 0 });
      const lead = await requestCallback(principal(await user('waiting')), { practiceId: s.practiceId });
      expect(lead.billingStatus).toBe('PENDING_FUNDS');
      expect((await listLeads(s.admin, s.organizationId))[0]!.patientEmail).toBeNull();

      const admin = await staff();
      await Promise.all([credit(s.organizationId, MIN, 'race-a', admin), credit(s.organizationId, MIN, 'race-b', admin), chargeLead(lead.id), chargeLead(lead.id)]);
      const fresh = await testDb().lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect([fresh.billingStatus, fresh.status]).toEqual(['CHARGED', 'DELIVERED']);
      expect(await leadCharges()).toBe(1);
      const wallet = await walletOf(s.organizationId);
      expect(wallet.balanceMinor).toBe(BigInt(2 * MIN) - GROSS);
      expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);
      // One PENDING_FUNDS decision and one CHARGED decision — no repeats from the retries.
      expect(await testDb().outboxEvent.count({ where: { name: 'LEAD_BILLED' } })).toBe(2);
      expect((await chargeLead(lead.id)).status).toBe('CHARGED');
      expect(await leadCharges()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('recharges and staff credits', () => {
    it('sets the minimum recharge at 20 paid leads plus GST, and refuses less unless staff say why', async () => {
      const s = await practice('recharge');
      const quote = await rechargeQuote(s.organizationId);
      expect(quote).toMatchObject({ leads: 20, minimumLeads: 20, netMinor: BigInt(100_000), taxMinor: BigInt(18_000), totalMinor: BigInt(MIN), minimumTotalMinor: BigInt(MIN) });
      expect(quote.perLead).toEqual({ netMinor: NET, taxMinor: TAX, grossMinor: GROSS });
      expect((await rechargeQuote(s.organizationId, 50)).totalMinor).toBe(GROSS * BigInt(50));

      const admin = await staff();
      await expect(credit(s.organizationId, MIN - 1, 'below', admin)).rejects.toThrow(/minimum recharge/);
      const below = { organizationId: s.organizationId, amountMinor: BigInt(50_000), externalReference: 'NEFT-SMALL', allowBelowMinimum: true };
      await expect(creditWallet(admin, below, { idempotencyKey: 'below-min-key-1' })).rejects.toThrow(/Explain why/);
      const allowed = await creditWallet(admin, { ...below, memo: 'Goodwill after the 9 September outage' }, { idempotencyKey: 'below-min-key-2' });
      expect(allowed.entry.amountMinor).toBe(BigInt(50_000));
      const audit = await testDb().auditEvent.findFirstOrThrow({ where: { action: 'WALLET_CREDITED', subject: allowed.entry.walletId } });
      expect(JSON.stringify(audit)).toMatch(/"belowMinimum":true/);

      const exact = await credit(s.organizationId, MIN, 'exact', admin);
      expect([exact.entry.netMinor, exact.entry.taxMinor, exact.entry.taxRateBasisPoints]).toEqual([BigInt(100_000), BigInt(18_000), 1800]);
      const goodwill = await creditWallet(admin, { organizationId: s.organizationId, amountMinor: BigInt(500), kind: 'ADJUSTMENT', externalReference: 'GOODWILL-1' }, { idempotencyKey: 'adjustment-key-1' });
      expect(goodwill.entry.kind).toBe('ADJUSTMENT');

      await expect(startTopUp(s.admin, s.organizationId, BigInt(MIN - 1), 'topup-intent-1')).rejects.toThrow(/minimum recharge/);
      // At the minimum it reaches the payment port, which has no provider: nothing is credited.
      await expect(startTopUp(s.admin, s.organizationId, BigInt(MIN), 'topup-intent-2')).rejects.toThrow(/configured/i);
      expect((await walletOf(s.organizationId)).balanceMinor).toBe(BigInt(50_000 + MIN + 500));
    });

    it('credits once per key, and refuses a missing key, a reused key, a bad amount or a non-staff caller', async () => {
      const s = await practice('staffa');
      const other = await practice('staffb');
      const admin = await staff();
      const body = { organizationId: s.organizationId, amountMinor: BigInt(MIN), externalReference: 'NEFT-001' };

      const first = await creditWallet(admin, body, { idempotencyKey: 'credit-shared-key-1' });
      const again = await creditWallet(admin, body, { idempotencyKey: 'credit-shared-key-1' });
      expect([again.entry.id, again.replayed]).toEqual([first.entry.id, true]);
      expect((await walletOf(s.organizationId)).balanceMinor).toBe(BigInt(MIN));

      await expect(creditWallet(admin, body, { idempotencyKey: '' })).rejects.toThrow(/Idempotency-Key/);
      await expect(creditWallet(admin, { ...body, organizationId: other.organizationId }, { idempotencyKey: 'credit-shared-key-1' })).rejects.toThrow(/already used/);
      await expect(creditWallet(admin, { ...body, amountMinor: BigInt(MIN + 100) }, { idempotencyKey: 'credit-shared-key-1' })).rejects.toThrow(/already used/);
      for (const amount of [BigInt(0), BigInt(-5), BigInt(100_000_001)]) {
        await expect(creditWallet(admin, { ...body, amountMinor: amount }, { idempotencyKey: `bad-amount-${amount}` })).rejects.toThrow();
      }
      await expect(creditWallet(s.admin, body, { idempotencyKey: 'clinic-admin-try' })).rejects.toThrow(/permission|forbidden/i);
      await expect(creditWallet(principal(await user('pt')), body, { idempotencyKey: 'patient-try-1' })).rejects.toThrow(/permission|forbidden/i);

      // A new key sent to two organizations at once: exactly one credit.
      const raced = await Promise.allSettled(
        [s, other].map((p) => creditWallet(admin, { ...body, organizationId: p.organizationId }, { idempotencyKey: 'credit-race-key-9' })),
      );
      expect(raced.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await testDb().ledgerEntry.count({ where: { idempotencyKey: 'credit:credit-race-key-9' } })).toBe(1);
      // Audited once per credit actually written; a replay is not a second credit.
      expect(await testDb().auditEvent.count({ where: { action: 'WALLET_CREDITED' } })).toBe(2);
      // The losing organization's credit rolled back entirely — including the
      // wallet its transaction would have created.
      for (const p of [s, other]) {
        const wallet = await testDb().wallet.findUnique({ where: { organizationId: p.organizationId } });
        if (wallet) expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('statements', () => {
    it('reconciles, keeps GST apart from price, counts free and paid leads, and is not a tax invoice', async () => {
      const s = await practice('statement', { freeLeads: 1 });
      const admin = await staff();
      await credit(s.organizationId, MIN, 'stmt', admin);
      expect((await requestCallback(principal(await user('free1')), { practiceId: s.practiceId })).billingStatus).toBe('FREE');
      const paid = await requestCallback(principal(await user('paid1')), { practiceId: s.practiceId });
      expect(paid.billingStatus).toBe('CHARGED');
      const dispute = await raiseDispute(s.admin, paid.id, { reason: 'WRONG_CONTACT', note: 'Unreachable' });
      await resolveDispute(admin, dispute.id, { decision: 'ACCEPTED', note: 'Confirmed unreachable' });
      const mistake = await creditWallet(admin, { organizationId: s.organizationId, amountMinor: BigInt(700), kind: 'ADJUSTMENT', externalReference: 'MISTAKE-1' }, { idempotencyKey: 'stmt-adjust-key-1' });
      await reverseEntry(admin, mistake.entry.id, 'Recorded in error');

      const statement = await accountStatement(s.admin, s.organizationId, today(), today());
      expect(statement).toMatchObject({
        kind: 'STATEMENT_OF_ACCOUNT',
        isTaxInvoice: false,
        reconciles: true,
        openingBalanceMinor: BigInt(0),
        creditsMinor: BigInt(MIN + 700),
        creditCount: 2,
        closingBalanceMinor: BigInt(MIN),
      });
      expect(statement.leadCharges).toEqual({ count: 1, netMinor: NET, taxMinor: TAX, grossMinor: GROSS });
      expect(statement.refunds).toEqual({ count: 1, amountMinor: GROSS, netMinor: NET, taxMinor: TAX });
      expect(statement.reversals).toEqual({ count: 1, amountMinor: BigInt(-700) });
      expect(statement.gst).toEqual({ chargedMinor: TAX, refundedMinor: TAX, netMinor: BigInt(0) });
      expect(statement.leads).toMatchObject({ billed: 2, free: 1, paid: 1, refunded: 1, pendingFunds: 0 });
      expect(statement.notice).toMatch(/not a GST tax invoice/);
      expect(statement.lines).toHaveLength(5);

      const tomorrow = localDateOf(new Date(Date.now() + DAY), TZ);
      const next = await accountStatement(s.admin, s.organizationId, tomorrow, tomorrow);
      expect([next.openingBalanceMinor, next.closingBalanceMinor, next.lines.length]).toEqual([BigInt(MIN), BigInt(MIN), 0]);

      const other = await practice('statement-other');
      await expect(accountStatement(other.admin, s.organizationId, today(), today())).rejects.toThrow(/not found/i);
      await expect(accountStatement(s.admin, s.organizationId, today(), '2020-01-01')).rejects.toThrow(/end date/);
      await expect(accountStatement(s.admin, s.organizationId, '2024-01-01', '2026-01-01')).rejects.toThrow(/one year/);
    });
  });

  // -------------------------------------------------------------------------
  describe('reminders', () => {
    it('sends tomorrow, today and soon reminders once each, however many jobs run', async () => {
      const s = await practice('remind');
      const slot = (await slotsFor(s.practiceId, 1)).find((x) => x.localTime === '11:00')!;
      const patient = principal(await user('reminded'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot.startsAt });
      const start = Date.parse(slot.startsAt);
      const run = async (before: number) => {
        const results = await Promise.all([1, 2, 3].map(() => sendDueReminders(new Date(start - before))));
        return results.reduce((a, b) => ({ dayBefore: a.dayBefore + b.dayBefore, today: a.today + b.today, soon: a.soon + b.soon }));
      };
      expect(await run(20 * HOUR)).toEqual({ dayBefore: 1, today: 0, soon: 0 }); // 15:00 IST the day before
      expect(await run(3 * HOUR)).toEqual({ dayBefore: 0, today: 1, soon: 0 }); // 08:00 IST on the day
      expect(await run(1 * HOUR)).toEqual({ dayBefore: 0, today: 0, soon: 1 });
      expect(await run(30 * MINUTE)).toEqual({ dayBefore: 0, today: 0, soon: 0 }); // already sent

      const rows = await testDb().appointmentReminder.findMany({ where: { appointmentId: appointment.id }, orderBy: { sentAt: 'asc' } });
      expect(rows.map((r) => r.kind)).toEqual(['DAY_BEFORE', 'TODAY', 'SOON']);
      const ids = ['TL-NOTIF-APPOINTMENT-REMINDER-001', 'TL-NOTIF-APPOINTMENT-TODAY-001', 'TL-NOTIF-APPOINTMENT-SOON-001'];
      const sent = await testDb().notificationRecord.findMany({ where: { userId: patient.userId, channel: 'IN_APP', notificationId: { in: ids } } });
      expect(sent.map((n) => n.notificationId).sort()).toEqual([...ids].sort());
    });

    it('never reminds a cancelled or completed visit, reminds a moved one for its new time, and sends a due follow-up once', async () => {
      const s = await practice('remind2');
      const slots = await slotsFor(s.practiceId, 1);
      const at = (t: string) => slots.find((x) => x.localTime === t)!.startsAt;
      const [p1, p2, p3] = (await Promise.all([user('r1'), user('r2'), user('r3')])).map((id) => principal(id));
      const cancelled = await bookAppointment(p1!, { practiceId: s.practiceId, startsAt: at('10:00') });
      const completed = await bookAppointment(p2!, { practiceId: s.practiceId, startsAt: at('12:00') });
      const moved = await bookAppointment(p3!, { practiceId: s.practiceId, startsAt: at('14:00') });

      await transition(p1!, cancelled.appointment.id, 'CANCEL', { reason: 'Unwell' });
      const visit = new Date(Date.parse(at('12:00')) - 5 * MINUTE);
      await transition(p2!, completed.appointment.id, 'CHECK_IN', {}, { now: visit });
      await transition(s.dentist, completed.appointment.id, 'START', {}, { now: visit });
      await transition(s.dentist, completed.appointment.id, 'COMPLETE', { followUpInDays: 1 }, { now: visit });

      expect(await sendDueReminders(new Date(Date.parse(at('14:00')) - 20 * HOUR))).toMatchObject({ dayBefore: 1 });
      await rescheduleAppointment(p3!, moved.appointment.id, { startsAt: at('16:00') });
      expect(await sendDueReminders(new Date(Date.parse(at('16:00')) - 20 * HOUR))).toMatchObject({ dayBefore: 1 });

      const forMoved = await testDb().appointmentReminder.findMany({ where: { appointmentId: moved.appointment.id } });
      expect(forMoved.map((r) => r.forInstant.toISOString()).sort()).toEqual([at('14:00'), at('16:00')].sort());
      expect(await testDb().appointmentReminder.count({ where: { appointmentId: { in: [cancelled.appointment.id, completed.appointment.id] } } })).toBe(0);

      const due = new Date(Date.parse(at('12:00')) + 2 * DAY);
      const followUps = await Promise.all([sendDueFollowUps(due), sendDueFollowUps(due)]);
      expect(followUps[0]!.sent + followUps[1]!.sent).toBe(1);
      expect(await sendDueFollowUps(due)).toEqual({ sent: 0 });
      expect(await testDb().appointmentReminder.count({ where: { appointmentId: completed.appointment.id, kind: 'FOLLOW_UP' } })).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('video consultations', () => {
    async function videoPractice(slug: string) {
      const s = await practice(slug, { acceptsVideo: true });
      await setAvailabilityRules(s.dentist, s.practiceId, { rules: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinutes: 540, endMinutes: 1020 })) });
      return s;
    }

    it('books a video consultation without inventing a meeting when no provider is connected', async () => {
      const s = await videoPractice('video');
      const [slot] = await slotsFor(s.practiceId, 2, 'VIDEO');
      const { appointment } = await bookAppointment(principal(await user('vid')), { practiceId: s.practiceId, type: 'VIDEO', startsAt: slot!.startsAt });
      expect(appointment.status).toBe('CONFIRMED');
      await relay();
      expect(await provisionVideoMeeting(appointment.id)).toEqual({ status: 'NOT_CONFIGURED' });
      expect(await testDb().videoMeeting.count()).toBe(0);
      expect(await videoMeetingView(appointment.id, 'PATIENT')).toMatchObject({ providerConfigured: false, link: null, status: null });
    });

    it('keeps a provider’s meeting in step with the appointment once a provider is connected', async () => {
      const calls: string[] = [];
      let made = 0;
      const testAdapter: VideoPort = {
        createMeeting: async (request) => {
          made += 1;
          calls.push(`create:${request.idempotencyKey}`);
          return { provider: 'test-video', externalMeetingId: `m${made}`, joinUrl: `https://video.test/join/m${made}`, hostUrl: `https://video.test/host/m${made}`, expiresAt: new Date(request.endsAt.getTime() + HOUR) };
        },
        cancelMeeting: async (externalMeetingId) => {
          calls.push(`cancel:${externalMeetingId}`);
        },
      };
      const s = await videoPractice('video2');
      videoProvider.set(testAdapter);
      const slots = await slotsFor(s.practiceId, 2, 'VIDEO');
      const patient = principal(await user('vid2'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, type: 'VIDEO', startsAt: slots[0]!.startsAt });
      await relay();

      expect(await provisionVideoMeeting(appointment.id)).toMatchObject({ status: 'SCHEDULED', replayed: true });
      expect(calls.filter((c) => c.startsWith('create'))).toHaveLength(1);
      expect((await videoMeetingView(appointment.id, 'PATIENT')).link).toBe('https://video.test/join/m1');
      expect((await videoMeetingView(appointment.id, 'PRACTICE')).link).toBe('https://video.test/host/m1');

      await rescheduleAppointment(patient, appointment.id, { startsAt: slots[2]!.startsAt });
      await relay();
      const moved = await testDb().videoMeeting.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      expect([moved.externalMeetingId, moved.status, moved.startsAt.toISOString()]).toEqual(['m2', 'SCHEDULED', slots[2]!.startsAt]);
      expect(calls).toContain('cancel:m1');

      await transition(patient, appointment.id, 'CANCEL', { reason: 'Feeling better' });
      await relay();
      expect((await testDb().videoMeeting.findUniqueOrThrow({ where: { appointmentId: appointment.id } })).status).toBe('CANCELLED');
      expect(calls).toContain('cancel:m2');
      expect((await videoMeetingView(appointment.id, 'PATIENT')).link).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('booking races', () => {
    it('lets only one of two racing reschedules take a slot', async () => {
      const s = await practice('rrace', { chairs: 5 });
      const slots = await slotsFor(s.practiceId);
      const [a, b] = (await Promise.all([user('ra'), user('rb')])).map((id) => principal(id));
      const one = await bookAppointment(a!, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      const two = await bookAppointment(b!, { practiceId: s.practiceId, startsAt: slots[1]!.startsAt });
      const target = slots[5]!.startsAt;
      const results = await Promise.allSettled([
        rescheduleAppointment(a!, one.appointment.id, { startsAt: target }),
        rescheduleAppointment(b!, two.appointment.id, { startsAt: target }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await testDb().appointment.count({ where: { startsAt: new Date(target) } })).toBe(1);
    });

    it('applies one transition from a request when a cancellation races a confirmation', async () => {
      const s = await practice('crace', { autoConfirm: false });
      const [slot] = await slotsFor(s.practiceId);
      const patient = principal(await user('cr'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot!.startsAt });
      const results = await Promise.allSettled([
        transition(patient, appointment.id, 'CANCEL', { reason: 'Changed my mind' }),
        transition(s.dentist, appointment.id, 'CONFIRM'),
      ]);
      const events = await testDb().appointmentEvent.findMany({ where: { appointmentId: appointment.id }, orderBy: { createdAt: 'asc' } });
      // Exactly one transition left the REQUESTED state; any second one acted on its result, in order.
      expect(events.filter((e) => e.fromStatus === 'REQUESTED')).toHaveLength(1);
      expect(events.length - 1).toBe(results.filter((r) => r.status === 'fulfilled').length);
      const final = await testDb().appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      expect(final.status).toBe(events.at(-1)!.toStatus);
    });
  });

  // -------------------------------------------------------------------------
  describe('notifications', () => {
    it('tells each side about every appointment, lead and wallet step, and never marks an unconfigured channel delivered', async () => {
      const s = await practice('notify', { autoConfirm: false, freeLeads: 0 });
      const admin = await staff();
      await creditWallet(
        admin,
        { organizationId: s.organizationId, amountMinor: BigInt(20_000), externalReference: 'NEFT-N1', allowBelowMinimum: true, memo: 'Small recharge to exercise alerts' },
        { idempotencyKey: 'notify-credit-key-1' },
      );
      const patientId = await user('notified');
      const patient = principal(patientId);
      const slots = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      await relay();
      await transition(s.dentist, appointment.id, 'CONFIRM');
      await relay();
      await rescheduleAppointment(patient, appointment.id, { startsAt: slots[2]!.startsAt });
      await relay();
      await transition(s.dentist, appointment.id, 'CONFIRM');
      const visit = new Date(Date.parse(slots[2]!.startsAt) - 5 * MINUTE);
      await transition(patient, appointment.id, 'CHECK_IN', {}, { now: visit });
      await transition(s.dentist, appointment.id, 'START', {}, { now: visit });
      await transition(s.dentist, appointment.id, 'COMPLETE', {}, { now: visit });
      await relay();
      const otherId = await user('canceller');
      const other = await bookAppointment(principal(otherId), { practiceId: s.practiceId, startsAt: slots[6]!.startsAt });
      await transition(principal(otherId), other.appointment.id, 'CANCEL', { reason: 'Travelling' });
      await requestCallback(principal(await user('caller')), { practiceId: s.practiceId });
      await relay();

      const inApp = async (userId: string) => (await testDb().notificationRecord.findMany({ where: { userId, channel: 'IN_APP' } })).map((n) => n.notificationId);
      expect(await inApp(patientId)).toEqual(
        expect.arrayContaining(['TL-NOTIF-APPOINTMENT-REQUESTED-001', 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', 'TL-NOTIF-APPOINTMENT-COMPLETED-001']),
      );
      expect(await inApp(s.dentistUserId)).toEqual(
        expect.arrayContaining([
          'TL-NOTIF-APPOINTMENT-CREATED-001',
          'TL-NOTIF-APPOINTMENT-RESCHEDULED-001',
          'TL-NOTIF-APPOINTMENT-CHECKED-IN-001',
          'TL-NOTIF-APPOINTMENT-CANCELLED-001',
          'TL-NOTIF-LEAD-OFFER-001',
        ]),
      );
      expect(await inApp(s.ownerId)).toEqual(
        expect.arrayContaining(['TL-NOTIF-BILLING-UPDATE-001', 'TL-NOTIF-LEAD-BILLED-001', 'TL-NOTIF-WALLET-LOW-BALANCE-001']),
      );
      // Two paid leads: 20,000 → 14,100 (below 3 leads' worth: warned once) → 8,200.
      expect(await testDb().outboxEvent.count({ where: { name: 'WALLET_LOW_BALANCE' } })).toBe(1);
      // No email, SMS, WhatsApp or push provider is connected: none may read as delivered.
      expect(await testDb().notificationRecord.count({ where: { channel: { in: ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] }, status: 'DELIVERED' } })).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('security', () => {
    it('keeps wallets, statements, leads and appointments inside their tenant, and ignores tampered fields', async () => {
      const s = await practice('seca', { freeLeads: 0 });
      const other = await practice('secb');
      await credit(s.organizationId, MIN, 'sec', await staff());
      const lead = await requestCallback(principal(await user('secpat')), { practiceId: s.practiceId });
      expect(lead.billingStatus).toBe('CHARGED');

      // Reads across tenants: the other organization's data does not exist for them.
      await expect(walletOverview(other.admin, s.organizationId)).rejects.toThrow(/not found/i);
      await expect(accountStatement(other.admin, s.organizationId, today(), today())).rejects.toThrow(/not found/i);
      await expect(leadStats(other.admin, s.organizationId)).rejects.toThrow(/not found/i);
      await expect(listLeads(other.dentist, s.organizationId)).rejects.toThrow(/not found/i);
      // Writes across tenants.
      await expect(raiseDispute(other.admin, lead.id, { reason: 'SPAM' })).rejects.toThrow(/not found/i);
      await expect(actOnLead(other.dentist, lead.id, { action: 'ACCEPT' })).rejects.toThrow(/not found/i);
      await expect(startTopUp(other.admin, s.organizationId, BigInt(MIN), 'x-org-topup')).rejects.toThrow(/not found/i);
      // A practice cannot credit, or undo a charge on, its own wallet.
      await expect(creditWallet(s.admin, { organizationId: s.organizationId, amountMinor: BigInt(MIN), externalReference: 'SELF-1' }, { idempotencyKey: 'self-credit-key' })).rejects.toThrow(/permission|forbidden/i);
      const charge = await testDb().ledgerEntry.findFirstOrThrow({ where: { kind: 'LEAD_CHARGE' } });
      await expect(reverseEntry(s.admin, charge.id, 'undo my charge')).rejects.toThrow(/permission|forbidden/i);
      await expect(reverseEntry(await staff(), charge.id, 'reverse a lead charge')).rejects.toThrow(/refunding the lead/);
      // Charging again is a replay, not a second charge.
      await expect(chargeLead(lead.id)).resolves.toMatchObject({ status: 'CHARGED', replayed: true });
      expect(await leadCharges()).toBe(1);
      // A lead cannot be pushed past its state.
      await expect(actOnLead(s.admin, lead.id, { action: 'CONVERTED' })).rejects.toThrow(/cannot be marked/);

      // Appointments: tampered fields are ignored, and other practices see nothing.
      const slots = await slotsFor(s.practiceId);
      const patient = principal(await user('tamper'));
      const tampered = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt, priceMinor: 1, status: 'COMPLETED' } as never);
      expect(tampered.appointment.status).toBe('CONFIRMED');
      expect(tampered.appointment.priceMinor).not.toBe(1);
      const id = tampered.appointment.id;
      await expect(getAppointment(other.dentist, id)).rejects.toThrow(/not found/i);
      await expect(transition(other.dentist, id, 'COMPLETE')).rejects.toThrow(/not found/i);
      await expect(rescheduleAppointment(other.admin, id, { startsAt: slots[3]!.startsAt, reason: 'Not ours to move' })).rejects.toThrow(/not found/i);
      await expect(transition(patient, id, 'COMPLETE')).rejects.toThrow(/permission|forbidden/i);
      await expect(transition(patient, id, 'CONFIRM')).rejects.toThrow(/permission|forbidden/i);
      await expect(bookAppointment(patient, { practiceId: s.practiceId, startsAt: slots[4]!.startsAt, serviceOfferingId: 'svc_not_offered_here' })).rejects.toThrow();
    });
  });
});
