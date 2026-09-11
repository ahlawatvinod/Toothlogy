/**
 * TL-TEST-BOOKING-CHAIN-001 — Availability → booking → lifecycle → leads → ₹90 billing
 *
 * Against the real database, with the real outbox handlers. Slots always
 * come from the availability engine; nothing is hard-coded. Test clinics
 * open every day and ignore public holidays, so the tests do not depend on
 * the calendar.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { createLocation } from '@/platform/organizations/locations';
import { addQualification, claimPractice, confirmPractice, submitForVerification, upsertDentistProfile } from '@/platform/dentists/service';
import { reviewVerification } from '@/platform/verification/service';
import { availableSlots, localDateOf } from '@/platform/appointments/availability';
import {
  bookAppointment,
  expireStaleAppointments,
  getAppointment,
  rescheduleAppointment,
  transition,
} from '@/platform/appointments/service';
import { addAvailabilityException } from '@/platform/appointments/availability-admin';
import { joinWaitlist } from '@/platform/appointments/waitlist';
import { actOnLead, leadStats, listLeads, requestCallback } from '@/platform/leads/service';
import { chargeLead, creditWallet, issueInvoice, raiseDispute, resolveDispute, reverseEntry, verifyLedgerIntegrity } from '@/platform/billing/service';
import { registerPlatformSubscribers, resetPlatformSubscribers } from '@/platform/events/subscribers';
import { relayOutbox } from '@/platform/events/outbox';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;
const TZ = 'Asia/Kolkata';
/** ₹50 net + 18% GST on platform fees, from the seeded configuration. */
const LEAD_GROSS = BigInt(5_900);
/** The seeded minimum recharge: 20 paid leads, tax included (₹1,180). */
const MIN_RECHARGE = 20 * 5_900;

/**
 * Tests about charging start at a paid lead: an organization-specific rule,
 * cloned from the seeded one, with no free allowance. (The free allowance
 * itself is covered in phase4-completion.test.ts.)
 */
async function noFreeLeads(organizationId: string) {
  const base = await testDb().leadPricingRule.findFirstOrThrow({
    where: { countryCode: 'IN', organizationId: null, dentistProfileId: null, treatmentId: null, leadSource: null, isActive: true, effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  await testDb().leadPricingRule.create({ data: { ...base, id: `lpr_t_${organizationId}`, organizationId, freeLeadAllowance: 0, createdAt: undefined } });
}

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

interface Setup {
  ownerId: string;
  organizationId: string;
  locationId: string;
  dentistUserId: string;
  practiceId: string;
  admin: AuthenticatedPrincipal;
  dentist: AuthenticatedPrincipal;
}

async function practice(slug: string, settings: { autoConfirm?: boolean; chairs?: number; acceptsEmergency?: boolean } = {}): Promise<Setup> {
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
    data: { autoConfirm: settings.autoConfirm ?? true, acceptsEmergency: settings.acceptsEmergency ?? false, minNoticeMinutes: 60 },
  });

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

async function slotsFor(practiceId: string, daysAhead = 2) {
  const date = localDateOf(new Date(Date.now() + daysAhead * DAY), TZ);
  const { slots } = await availableSlots({ practiceId, type: 'CLINIC', fromDate: date, toDate: date });
  return slots;
}

const staff = async () => principal(await user('staff'), [], ['platform_admin']);
const relay = () => relayOutbox({ batchSize: 200 });
const credit = (organizationId: string, amountMinor: number, key: string, actor: AuthenticatedPrincipal) =>
  creditWallet(actor, { organizationId, amountMinor: BigInt(amountMinor), externalReference: `NEFT-${key}` }, { idempotencyKey: `credit-key-${key}-${organizationId}` });

describeIntegration('booking, lifecycle, leads and billing (integration)', () => {
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

  // -------------------------------------------------------------------------
  describe('availability', () => {
    it('comes from the database: hours, existing bookings and leave', async () => {
      const s = await practice('avail');
      const before = await slotsFor(s.practiceId);
      expect(before.length).toBe(16); // 09:00–17:00 in 30-minute slots
      const patient = await user('pat');
      await bookAppointment(principal(patient), { practiceId: s.practiceId, startsAt: before[0]!.startsAt });
      const after = await slotsFor(s.practiceId);
      expect(after.map((x) => x.startsAt)).not.toContain(before[0]!.startsAt);

      await addAvailabilityException(s.dentist, s.practiceId, { kind: 'LEAVE', startsAt: before[4]!.startsAt, endsAt: before[8]!.startsAt, reason: 'Conference' });
      const withLeave = await slotsFor(s.practiceId);
      expect(withLeave.map((x) => x.startsAt)).not.toContain(before[5]!.startsAt);
    });

    it('refuses leave over a booked appointment', async () => {
      const s = await practice('leave');
      const [slot] = await slotsFor(s.practiceId);
      await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await expect(
        addAvailabilityException(s.dentist, s.practiceId, { kind: 'BLOCK', startsAt: slot!.startsAt, endsAt: slot!.endsAt }),
      ).rejects.toThrow(/booked appointment/);
    });
  });

  // -------------------------------------------------------------------------
  describe('booking', () => {
    it('books a real slot and confirms it instantly where the practice allows', async () => {
      const s = await practice('instant');
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      expect(appointment.status).toBe('CONFIRMED');
      expect(appointment.mode).toBe('INSTANT');
      const events = await testDb().appointmentEvent.findMany({ where: { appointmentId: appointment.id } });
      expect(events.map((e) => e.action)).toEqual(['BOOK']);
      expect(await testDb().lead.count({ where: { appointmentId: appointment.id } })).toBe(1);
    });

    it('holds a request for the practice to decide', async () => {
      const s = await practice('request', { autoConfirm: false });
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      expect(appointment.status).toBe('REQUESTED');
      expect(appointment.expiresAt).not.toBeNull();
    });

    it('refuses a time that is not a slot, or is in the past', async () => {
      const s = await practice('invalid');
      const patient = principal(await user('pat'));
      const [slot] = await slotsFor(s.practiceId);
      const offGrid = new Date(Date.parse(slot!.startsAt) + 7 * 60_000).toISOString();
      await expect(bookAppointment(patient, { practiceId: s.practiceId, startsAt: offGrid })).rejects.toThrow(/no longer available/);
      await expect(bookAppointment(patient, { practiceId: s.practiceId, startsAt: new Date(Date.now() - DAY).toISOString() })).rejects.toThrow(/already passed/);
    });

    it('refuses emergency booking where the practice does not take emergencies', async () => {
      const s = await practice('noemergency');
      const [slot] = await slotsFor(s.practiceId);
      await expect(
        bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt, emergency: true }),
      ).rejects.toThrow(/emergency/);
    });

    it('returns the same appointment when a request is replayed with its key', async () => {
      const s = await practice('replay');
      const patient = principal(await user('pat'));
      const [slot] = await slotsFor(s.practiceId);
      const first = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot!.startsAt }, { bookingKey: 'key-1' });
      const again = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot!.startsAt }, { bookingKey: 'key-1' });
      expect(again.appointment.id).toBe(first.appointment.id);
      expect(again.replayed).toBe(true);
      expect(await testDb().appointment.count()).toBe(1);
    });

    it('lets exactly one of two simultaneous bookings take a slot', async () => {
      const s = await practice('race', { chairs: 5 });
      const [slot] = await slotsFor(s.practiceId);
      const [a, b, c] = await Promise.all([user('p1'), user('p2'), user('p3')]);
      const results = await Promise.allSettled(
        [a, b, c].map((id) => bookAppointment(principal(id), { practiceId: s.practiceId, startsAt: slot!.startsAt })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const losers = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(losers).toHaveLength(2);
      for (const l of losers) expect(String(l.reason)).toMatch(/taken|no longer available/);
      expect(await testDb().appointment.count({ where: { startsAt: new Date(slot!.startsAt) } })).toBe(1);
    });

    it('has the database refuse an overlapping appointment even without the service', async () => {
      const s = await practice('constraint');
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      const other = await user('other');
      await expect(
        testDb().appointment.create({
          data: { ...appointment, id: 'apt_forced_overlap', patientUserId: other, bookingKey: null, bookingMetadata: undefined, visitLatitude: null, visitLongitude: null, createdAt: undefined, updatedAt: undefined },
        }),
      ).rejects.toThrow(/appointments_no_dentist_overlap|23P01|exclusion/i);
    });

    it('keeps each appointment private to its patient and practice', async () => {
      const s = await practice('private');
      const other = await practice('other');
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await expect(getAppointment(principal(await user('stranger')), appointment.id)).rejects.toThrow(/not found/i);
      await expect(getAppointment(other.admin, appointment.id)).rejects.toThrow(/not found/i);
      await expect(transition(other.admin, appointment.id, 'CANCEL', { reason: 'Not ours' })).rejects.toThrow(/not found/i);
      expect((await getAppointment(s.dentist, appointment.id)).actor).toBe('PRACTICE');
    });
  });

  // -------------------------------------------------------------------------
  describe('lifecycle', () => {
    it('walks confirm → check in → start → complete, and refuses skipping steps', async () => {
      const s = await practice('lifecycle', { autoConfirm: false });
      const patientId = await user('pat');
      const [slot] = await slotsFor(s.practiceId, 0 + 2);
      const { appointment } = await bookAppointment(principal(patientId), { practiceId: s.practiceId, startsAt: slot!.startsAt });

      await expect(transition(principal(patientId), appointment.id, 'CONFIRM')).rejects.toThrow(/permission|forbidden/i);
      await expect(transition(s.dentist, appointment.id, 'COMPLETE')).rejects.toThrow(/cannot be completed/);
      await transition(s.dentist, appointment.id, 'CONFIRM');
      // A second confirmation is refused, not processed twice.
      await expect(transition(s.admin, appointment.id, 'CONFIRM')).rejects.toThrow(/cannot be confirmed/);

      const atStart = new Date(Date.parse(slot!.startsAt) - 10 * 60_000);
      await expect(transition(principal(patientId), appointment.id, 'CHECK_IN', {}, { now: new Date(Date.parse(slot!.startsAt) - 3 * 3_600_000) })).rejects.toThrow(/Check-in opens/);
      await transition(principal(patientId), appointment.id, 'CHECK_IN', {}, { now: atStart });
      await transition(s.dentist, appointment.id, 'START', {}, { now: atStart });
      const done = await transition(s.dentist, appointment.id, 'COMPLETE', { followUpInDays: 180, followUpNote: 'Six-month check' }, { now: atStart });
      expect(done.status).toBe('COMPLETED');
      expect(done.followUpDueAt).not.toBeNull();
      const actions = (await testDb().appointmentEvent.findMany({ where: { appointmentId: appointment.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.action);
      expect(actions).toEqual(['BOOK', 'CONFIRM', 'CHECK_IN', 'START', 'COMPLETE']);
      await expect(transition(principal(patientId), appointment.id, 'CANCEL')).rejects.toThrow(/cannot be cancelled/);
    });

    it('declines with a reason, and records a no-show only after the start', async () => {
      const s = await practice('decline', { autoConfirm: false });
      const slots = await slotsFor(s.practiceId);
      const one = await bookAppointment(principal(await user('p1')), { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      await expect(transition(s.dentist, one.appointment.id, 'REJECT')).rejects.toThrow(/reason/);
      expect((await transition(s.dentist, one.appointment.id, 'REJECT', { reason: 'Fully booked that day' })).status).toBe('REJECTED');

      const two = await bookAppointment(principal(await user('p2')), { practiceId: s.practiceId, startsAt: slots[1]!.startsAt });
      await transition(s.dentist, two.appointment.id, 'CONFIRM');
      await expect(transition(s.dentist, two.appointment.id, 'NO_SHOW')).rejects.toThrow(/after the start/);
      const noShow = await transition(s.dentist, two.appointment.id, 'NO_SHOW', {}, { now: new Date(Date.parse(slots[1]!.startsAt) + 20 * 60_000) });
      expect(noShow.status).toBe('NO_SHOW');
    });

    it('lets the patient cancel and frees the slot', async () => {
      const s = await practice('cancel');
      const [slot] = await slotsFor(s.practiceId);
      const patient = principal(await user('pat'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot!.startsAt });
      const cancelled = await transition(patient, appointment.id, 'CANCEL', { reason: 'Travelling' });
      expect(cancelled.cancelledBy).toBe('PATIENT');
      await expect(bookAppointment(principal(await user('next')), { practiceId: s.practiceId, startsAt: slot!.startsAt })).resolves.toBeDefined();
    });

    it('reschedules atomically: the old slot is released, the new one taken', async () => {
      const s = await practice('move');
      const slots = await slotsFor(s.practiceId);
      const patient = principal(await user('pat'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      const moved = await rescheduleAppointment(patient, appointment.id, { startsAt: slots[3]!.startsAt });
      expect(moved.startsAt.toISOString()).toBe(slots[3]!.startsAt);
      expect(moved.status).toBe('CONFIRMED');
      await expect(bookAppointment(principal(await user('p2')), { practiceId: s.practiceId, startsAt: slots[0]!.startsAt })).resolves.toBeDefined();
      await expect(bookAppointment(principal(await user('p3')), { practiceId: s.practiceId, startsAt: slots[3]!.startsAt })).rejects.toThrow(/no longer available|taken/);
    });

    it('asks the patient to accept a time the practice proposes', async () => {
      const s = await practice('propose');
      const slots = await slotsFor(s.practiceId);
      const patient = principal(await user('pat'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      await expect(rescheduleAppointment(s.dentist, appointment.id, { startsAt: slots[2]!.startsAt })).rejects.toThrow(/why/);
      const proposed = await rescheduleAppointment(s.dentist, appointment.id, { startsAt: slots[2]!.startsAt, reason: 'Emergency surgery that morning' });
      expect(proposed.status).toBe('PENDING');
      expect((await transition(patient, appointment.id, 'ACCEPT')).status).toBe('CONFIRMED');
    });
  });

  // -------------------------------------------------------------------------
  describe('waitlist', () => {
    it('offers a freed slot to the first waiting patient only, and moves on when it lapses', async () => {
      const s = await practice('wait');
      const [slot] = await slotsFor(s.practiceId);
      const date = localDateOf(new Date(slot!.startsAt), TZ);
      const booker = principal(await user('booker'));
      const first = principal(await user('first'));
      const second = principal(await user('second'));
      const { appointment } = await bookAppointment(booker, { practiceId: s.practiceId, startsAt: slot!.startsAt });
      const e1 = await joinWaitlist(first, { dentistProfileId: (await testDb().dentistPractice.findUniqueOrThrow({ where: { id: s.practiceId } })).dentistProfileId, earliestDate: date, latestDate: date });
      const e2 = await joinWaitlist(second, { locationId: s.locationId, earliestDate: date, latestDate: date });

      await transition(booker, appointment.id, 'CANCEL', { reason: 'Changed plans' });
      await relay();
      const hold = await testDb().appointment.findFirstOrThrow({ where: { waitlistEntryId: e1.id } });
      expect(hold.status).toBe('PENDING');
      expect(hold.patientUserId).toBe(first.userId);
      // Nobody else can take the held slot, including the second patient.
      await expect(bookAppointment(second, { practiceId: s.practiceId, startsAt: slot!.startsAt })).rejects.toThrow(/no longer available|taken/);
      await expect(transition(second, hold.id, 'ACCEPT')).rejects.toThrow(/not found/i);

      // The first patient lets it lapse; it goes to the second.
      await testDb().appointment.update({ where: { id: hold.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expireStaleAppointments();
      expect((await testDb().waitlistEntry.findUniqueOrThrow({ where: { id: e1.id } })).status).toBe('ACTIVE');
      await relay();
      const next = await testDb().appointment.findFirstOrThrow({ where: { waitlistEntryId: e2.id } });
      expect((await transition(second, next.id, 'ACCEPT')).status).toBe('CONFIRMED');
      expect((await testDb().waitlistEntry.findUniqueOrThrow({ where: { id: e2.id } })).status).toBe('BOOKED');
    });
  });

  // -------------------------------------------------------------------------
  describe('leads and paid-lead billing', () => {
    it('qualifies a confirmed booking, waits for funds, and charges ₹50 + GST once after a recharge', async () => {
      const s = await practice('billing');
      await noFreeLeads(s.organizationId);
      const admin = await staff();
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await relay();

      let lead = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      expect(lead.status).toBe('APPOINTMENT'); // qualified, delivered, accepted by confirming
      expect(lead.billingStatus).toBe('PENDING_FUNDS'); // the wallet is empty, and it never goes negative
      expect(lead.qualificationRuleVersion).toBe(1);

      const { retried } = await credit(s.organizationId, MIN_RECHARGE, 'topup-1', admin);
      expect(retried).toBe(1);
      lead = await testDb().lead.findUniqueOrThrow({ where: { id: lead.id } });
      expect(lead.billingStatus).toBe('CHARGED');
      const charge = await testDb().ledgerEntry.findUniqueOrThrow({ where: { id: lead.chargeEntryId! } });
      expect(charge.amountMinor).toBe(-LEAD_GROSS);
      expect(charge.netMinor).toBe(BigInt(-5000));
      expect(charge.taxMinor).toBe(BigInt(-900));

      // Charging again is a no-op, at the service and at the database.
      const again = await chargeLead(lead.id);
      expect(again.status).toBe('CHARGED');
      expect(await testDb().ledgerEntry.count({ where: { kind: 'LEAD_CHARGE' } })).toBe(1);
      const wallet = await testDb().wallet.findUniqueOrThrow({ where: { organizationId: s.organizationId } });
      expect(wallet.balanceMinor).toBe(BigInt(MIN_RECHARGE) - LEAD_GROSS);
      expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);
      // A replayed credit with the same key is not credited twice.
      await credit(s.organizationId, MIN_RECHARGE, 'topup-1', admin);
      expect((await testDb().wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceMinor).toBe(BigInt(MIN_RECHARGE) - LEAD_GROSS);
    });

    it('does not qualify a request until the practice confirms it', async () => {
      const s = await practice('reqlead', { autoConfirm: false });
      await noFreeLeads(s.organizationId);
      await credit(s.organizationId, MIN_RECHARGE, 'topup', await staff());
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await relay();
      expect((await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } })).status).toBe('NEW');
      await transition(s.dentist, appointment.id, 'CONFIRM');
      await relay();
      const lead = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      expect(lead.status).toBe('APPOINTMENT');
      expect(lead.billingStatus).toBe('CHARGED');
    });

    it('never bills an unverified patient, a duplicate, or a practice member', async () => {
      const s = await practice('nobill');
      await noFreeLeads(s.organizationId);
      await credit(s.organizationId, MIN_RECHARGE, 'topup', await staff());
      const slots = await slotsFor(s.practiceId);

      const unverified = principal(await user('unverified', 'patient', false));
      const a = await bookAppointment(unverified, { practiceId: s.practiceId, startsAt: slots[0]!.startsAt });
      const repeat = principal(await user('repeat'));
      const b = await bookAppointment(repeat, { practiceId: s.practiceId, startsAt: slots[2]!.startsAt });
      const c = await bookAppointment(repeat, { practiceId: s.practiceId, startsAt: slots[4]!.startsAt });
      await relay();

      const byAppointment = async (id: string) => testDb().lead.findUniqueOrThrow({ where: { appointmentId: id } });
      expect((await byAppointment(a.appointment.id)).status).toBe('NOT_QUALIFIED');
      expect((await byAppointment(b.appointment.id)).billingStatus).toBe('CHARGED');
      const duplicate = await byAppointment(c.appointment.id);
      expect(duplicate.status).toBe('DUPLICATE');
      expect(duplicate.billingStatus).toBe('NOT_BILLABLE');
      expect(await testDb().ledgerEntry.count({ where: { kind: 'LEAD_CHARGE' } })).toBe(1);
    });

    it('follows the visit to completion and conversion', async () => {
      const s = await practice('convert');
      await noFreeLeads(s.organizationId);
      await credit(s.organizationId, MIN_RECHARGE, 'topup', await staff());
      const [slot] = await slotsFor(s.practiceId);
      const patient = principal(await user('pat'));
      const { appointment } = await bookAppointment(patient, { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await relay();
      const at = new Date(Date.parse(slot!.startsAt) - 5 * 60_000);
      await transition(patient, appointment.id, 'CHECK_IN', {}, { now: at });
      await transition(s.dentist, appointment.id, 'START', {}, { now: at });
      await transition(s.dentist, appointment.id, 'COMPLETE', {}, { now: at });
      await relay();
      const lead = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
      expect(lead.status).toBe('COMPLETED');
      // A completed visit is not yet a conversion: the two rates are reported apart.
      const before = await leadStats(s.admin, s.organizationId);
      expect([before.visitRate, before.conversionRate]).toEqual([100, 0]);
      const converted = await actOnLead(s.admin, lead.id, { action: 'CONVERTED' });
      expect(converted.status).toBe('CONVERTED');
      const history = (await testDb().leadEvent.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.action);
      expect(history).toEqual(['CREATE', 'QUALIFY', 'CHARGED', 'DELIVER', 'ACCEPT', 'APPOINTMENT', 'COMPLETE', 'CONVERTED']);
      const after = await leadStats(s.admin, s.organizationId);
      expect([after.visitRate, after.conversionRate]).toEqual([100, 100]);
    });

    it('withholds a callback patient’s contact until the lead is paid for', async () => {
      const s = await practice('callback');
      await noFreeLeads(s.organizationId);
      const patientId = await user('caller');
      await requestCallback(principal(patientId), { practiceId: s.practiceId, note: 'Toothache since Monday' });
      let [lead] = await listLeads(s.admin, s.organizationId);
      expect(lead!.status).toBe('QUALIFIED');
      expect(lead!.billingStatus).toBe('PENDING_FUNDS');
      expect(lead!.patientEmail).toBeNull();
      expect(lead!.patientName).toMatch(/after payment/);

      await credit(s.organizationId, MIN_RECHARGE, 'topup', await staff());
      [lead] = await listLeads(s.admin, s.organizationId);
      expect(lead!.status).toBe('DELIVERED');
      expect(lead!.patientEmail).toMatch(/caller/);
      await actOnLead(s.admin, lead!.id, { action: 'ACCEPT' });
      await actOnLead(s.admin, lead!.id, { action: 'CONTACTED' });
      expect((await testDb().lead.findUniqueOrThrow({ where: { id: lead!.id } })).status).toBe('CONTACTED');
    });

    it('keeps leads inside their practice', async () => {
      const s = await practice('leadsA');
      const other = await practice('leadsB');
      await requestCallback(principal(await user('caller')), { practiceId: s.practiceId });
      const [lead] = await listLeads(s.admin, s.organizationId);
      await expect(listLeads(other.admin, s.organizationId)).rejects.toThrow(/not found/i);
      await expect(actOnLead(other.admin, lead!.id, { action: 'REJECT', reason: 'Not ours' })).rejects.toThrow(/not found/i);
      await expect(actOnLead(principal(await user('patient-x')), lead!.id, { action: 'ACCEPT' })).rejects.toThrow(/not found/i);
    });

    it('refuses to reverse a credit that has already been spent', async () => {
      const s = await practice('spent');
      await noFreeLeads(s.organizationId);
      const admin = await staff();
      const { entry: topUp } = await credit(s.organizationId, MIN_RECHARGE, 'topup', admin);
      const [slot] = await slotsFor(s.practiceId);
      await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await relay();
      // 118,000 − 5,900 = 112,100 left: reversing the 118,000 would go below zero.
      await expect(reverseEntry(admin, topUp.id, 'Recorded in error')).rejects.toThrow(/no longer holds enough/);
      await expect(reverseEntry(s.admin, topUp.id, 'Not staff')).rejects.toThrow(/permission|forbidden/i);
    });

    it('refunds an upheld dispute once, and never lets the ledger be edited or overdrawn', async () => {
      const s = await practice('dispute');
      await noFreeLeads(s.organizationId);
      const admin = await staff();
      const { entry: topUp } = await credit(s.organizationId, MIN_RECHARGE, 'topup', admin);
      const [slot] = await slotsFor(s.practiceId);
      const { appointment } = await bookAppointment(principal(await user('pat')), { practiceId: s.practiceId, startsAt: slot!.startsAt });
      await relay();
      const lead = await testDb().lead.findUniqueOrThrow({ where: { appointmentId: appointment.id } });

      const dispute = await raiseDispute(s.admin, lead.id, { reason: 'WRONG_CONTACT', note: 'Number unreachable' });
      await expect(raiseDispute(s.admin, lead.id, { reason: 'SPAM' })).rejects.toThrow(/already/);
      await expect(resolveDispute(s.admin, dispute.id, { decision: 'ACCEPTED', note: 'Self-approval attempt' })).rejects.toThrow(/permission|forbidden/i);
      await resolveDispute(admin, dispute.id, { decision: 'ACCEPTED', note: 'Contact verified as unreachable' });
      await expect(resolveDispute(admin, dispute.id, { decision: 'ACCEPTED', note: 'Twice' })).rejects.toThrow(/already been decided/);

      const wallet = await testDb().wallet.findUniqueOrThrow({ where: { organizationId: s.organizationId } });
      expect(wallet.balanceMinor).toBe(BigInt(MIN_RECHARGE));
      expect((await testDb().lead.findUniqueOrThrow({ where: { id: lead.id } })).billingStatus).toBe('REFUNDED');
      expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);

      // The ledger is append-only, and the balance has a floor — in the database.
      await expect(testDb().$executeRaw`UPDATE "ledger_entries" SET "amountMinor" = 1 WHERE "id" = ${topUp.id}`).rejects.toThrow(/append-only/);
      await expect(testDb().$executeRaw`DELETE FROM "ledger_entries" WHERE "id" = ${topUp.id}`).rejects.toThrow(/append-only/);
      await expect(testDb().wallet.update({ where: { id: wallet.id }, data: { balanceMinor: BigInt(-1) } })).rejects.toThrow(/wallets_balance_floor|check/i);

      // With the refund back, the credit is unspent and can be reversed — once.
      const reversal = await reverseEntry(admin, topUp.id, 'Recorded in error');
      expect((await testDb().wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balanceMinor).toBe(BigInt(0));
      // Asking again returns the same reversal: an entry is reversed once, however often it is asked.
      expect((await reverseEntry(admin, topUp.id, 'Recorded in error again')).id).toBe(reversal.id);
      expect(await testDb().ledgerEntry.count({ where: { kind: 'REVERSAL' } })).toBe(1);
      await expect(reverseEntry(admin, reversal.id, 'Undo the undo')).rejects.toThrow(/cannot itself be reversed/);
      expect((await verifyLedgerIntegrity(wallet.id)).ok).toBe(true);

      const invoice = await issueInvoice(s.organizationId, new Date(Date.now() - DAY), new Date(Date.now() + DAY));
      expect(invoice.subtotalMinor).toBe(BigInt(0)); // charge and refund net to zero
      expect(await issueInvoice(s.organizationId, invoice.periodStart, invoice.periodEnd)).toMatchObject({ id: invoice.id });
    });
  });
});
