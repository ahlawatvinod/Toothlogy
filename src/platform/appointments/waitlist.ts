/**
 * TOOTHLOGY WAITLIST
 *
 * A patient who could not find a time asks to be told when one opens. When a
 * slot is freed — a cancellation, a declined or lapsed request, a move — the
 * oldest matching entry is offered it as a PENDING hold: a real appointment
 * row, so the same exclusion constraint that stops double booking also makes
 * it impossible for two waitlisted patients to hold one slot. Only the patient
 * it was offered to can accept it; if they let it lapse, it goes to the next.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { emitInTransaction } from '../events/outbox';
import { isAuthenticated, type Principal } from '../rbac';
import { generateSlots, loadAvailabilityContext, localDateOf, timeOfDayOf, type SlotAppointmentType } from './availability';

const HOLD_HOURS = 2;
const MAX_ACTIVE_ENTRIES = 5;
const MAX_WINDOW_DAYS = 90;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-02.');

export const joinWaitlistSchema = z
  .object({
    dentistProfileId: z.string().max(64).optional(),
    locationId: z.string().max(64).optional(),
    serviceOfferingId: z.string().max(64).optional(),
    type: z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT']).default('CLINIC'),
    earliestDate: isoDate,
    latestDate: isoDate,
    timeOfDay: z.enum(['ANY', 'MORNING', 'AFTERNOON', 'EVENING']).default('ANY'),
  })
  .refine((v) => v.dentistProfileId || v.locationId, { message: 'Choose a dentist or a clinic branch.', path: ['dentistProfileId'] })
  .refine((v) => v.latestDate >= v.earliestDate, { message: 'The last date must not be before the first.', path: ['latestDate'] });

export async function joinWaitlist(principal: Principal, raw: z.input<typeof joinWaitlistSchema>, now: Date = new Date()) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = joinWaitlistSchema.parse(raw);
  const today = now.toISOString().slice(0, 10);
  if (input.latestDate < today) throw errors.validation('Choose dates in the future.', { field: 'latestDate' });
  const span = (Date.parse(`${input.latestDate}T00:00:00Z`) - Date.parse(`${input.earliestDate}T00:00:00Z`)) / 86_400_000;
  if (span > MAX_WINDOW_DAYS) throw errors.validation(`Choose at most ${MAX_WINDOW_DAYS} days.`, { field: 'latestDate' });

  if (input.dentistProfileId) {
    const dentist = await db().dentistProfile.findFirst({ where: { id: input.dentistProfileId, isDiscoverable: true } });
    if (!dentist) throw errors.validation('That dentist is not taking appointments.', { field: 'dentistProfileId' });
  }
  if (input.locationId) {
    const location = await db().location.findFirst({ where: { id: input.locationId, deletedAt: null } });
    if (!location) throw errors.validation('That branch is not taking appointments.', { field: 'locationId' });
  }
  const active = await db().waitlistEntry.count({ where: { patientUserId: principal.userId, status: { in: ['ACTIVE', 'OFFERED'] } } });
  if (active >= MAX_ACTIVE_ENTRIES) throw errors.preconditionFailed(`You can wait for at most ${MAX_ACTIVE_ENTRIES} openings at once.`);

  return db().waitlistEntry.create({
    data: {
      id: newId('waitlist'),
      patientUserId: principal.userId,
      dentistProfileId: input.dentistProfileId ?? null,
      locationId: input.locationId ?? null,
      serviceOfferingId: input.serviceOfferingId ?? null,
      type: input.type,
      earliestDate: new Date(`${input.earliestDate}T00:00:00Z`),
      latestDate: new Date(`${input.latestDate}T00:00:00Z`),
      timeOfDay: input.timeOfDay,
    },
  });
}

export async function leaveWaitlist(principal: Principal, entryId: string) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const entry = await db().waitlistEntry.findFirst({ where: { id: entryId, patientUserId: principal.userId }, include: { hold: { select: { id: true, status: true } } } });
  if (!entry) throw errors.notFound('Waitlist entry');
  if (entry.status !== 'ACTIVE' && entry.status !== 'OFFERED') throw errors.preconditionFailed('This waitlist entry is already closed.');
  if (entry.hold && entry.hold.status === 'PENDING') {
    const { transition } = await import('./service');
    await transition(principal, entry.hold.id, 'CANCEL', { reason: 'Left the waitlist.' });
  }
  return db().waitlistEntry.update({ where: { id: entry.id }, data: { status: 'CANCELLED' } });
}

export async function listWaitlist(userId: string) {
  return db().waitlistEntry.findMany({
    where: { patientUserId: userId },
    include: { hold: { select: { id: true, status: true, startsAt: true, expiresAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export interface FreedSlot {
  readonly practiceId: string;
  readonly dentistProfileId: string;
  readonly locationId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

function isOverlapViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('appointments_no_dentist_overlap') || text.includes('23P01');
}

/**
 * Offer a freed slot to the first matching waitlist entry. Returns the hold's
 * id, or null when nobody matches or the slot is no longer free. At most one
 * hold is created per call, and the database guarantees at most one per slot.
 */
export async function offerFreedSlot(freed: FreedSlot, now: Date = new Date()): Promise<string | null> {
  if (freed.startsAt.getTime() <= now.getTime() + 30 * 60_000) return null;

  const practice = await db().dentistPractice.findUnique({
    where: { id: freed.practiceId },
    include: { location: { select: { id: true, organizationId: true, timezone: true } } },
  });
  if (!practice) return null;
  const date = localDateOf(freed.startsAt, practice.location.timezone);
  const dateValue = new Date(`${date}T00:00:00Z`);
  const minutes = (freed.endsAt.getTime() - freed.startsAt.getTime()) / 60_000;
  const localTime = new Intl.DateTimeFormat('en-GB', { timeZone: practice.location.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(freed.startsAt);
  const period = timeOfDayOf(localTime);

  const candidates = await db().waitlistEntry.findMany({
    where: {
      status: 'ACTIVE',
      earliestDate: { lte: dateValue },
      latestDate: { gte: dateValue },
      timeOfDay: { in: ['ANY', period] },
      OR: [{ dentistProfileId: freed.dentistProfileId }, { dentistProfileId: null, locationId: freed.locationId }],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  for (const entry of candidates) {
    // Someone who already let a hold on this very slot lapse is not offered it
    // again; the next person in line is.
    const declined = await db().appointment.count({
      where: { patientUserId: entry.patientUserId, practiceId: practice.id, startsAt: freed.startsAt, source: 'WAITLIST', status: { in: ['EXPIRED', 'CANCELLED'] } },
    });
    if (declined > 0) continue;
    const serviceOfferingId =
      entry.serviceOfferingId &&
      (await db().serviceOffering.count({ where: { id: entry.serviceOfferingId, locationId: practice.location.id, isActive: true } })) > 0
        ? entry.serviceOfferingId
        : null;
    const offering = serviceOfferingId ? await db().serviceOffering.findUnique({ where: { id: serviceOfferingId } }) : null;
    const duration = offering?.durationMinutes ?? practice.slotMinutes;
    if (duration > minutes) continue;

    try {
      const holdId = await transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "locations" WHERE "id" = ${practice.location.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "dentist_profiles" WHERE "id" = ${practice.dentistProfileId} FOR UPDATE`;
        const context = await loadAvailabilityContext(practice.id, date, date, { client: tx });
        const slot = generateSlots(context, {
          type: entry.type as SlotAppointmentType,
          durationMinutes: duration,
          serviceTypes: offering?.appointmentTypes,
          fromDate: date,
          toDate: date,
          now,
        }).find((s) => s.startsAt === freed.startsAt.toISOString());
        if (!slot) return null;

        const claim = await tx.waitlistEntry.updateMany({ where: { id: entry.id, status: 'ACTIVE' }, data: { status: 'OFFERED', offerCount: { increment: 1 } } });
        if (claim.count === 0) return null;

        const id = newId('appointment');
        const holdUntil = Math.min(now.getTime() + HOLD_HOURS * 3_600_000, freed.startsAt.getTime() - 15 * 60_000);
        const created = await tx.appointment.create({
          data: {
            id,
            patientUserId: entry.patientUserId,
            practiceId: practice.id,
            dentistProfileId: practice.dentistProfileId,
            locationId: practice.location.id,
            organizationId: practice.location.organizationId,
            serviceOfferingId,
            serviceName: offering?.name ?? 'Consultation',
            priceMinor: offering?.priceMinor ?? practice.consultationFeeMinor ?? null,
            priceMaxMinor: offering?.priceMaxMinor ?? null,
            currency: offering?.currency ?? null,
            startsAt: new Date(slot.startsAt),
            endsAt: new Date(slot.endsAt),
            occupiedUntil: new Date(slot.occupiedUntil),
            timezone: practice.location.timezone,
            type: entry.type,
            mode: practice.autoConfirm ? 'INSTANT' : 'REQUEST',
            usesChair: entry.type === 'CLINIC',
            status: 'PENDING',
            source: 'WAITLIST',
            expiresAt: new Date(holdUntil),
            waitlistEntryId: entry.id,
          },
        });
        await tx.appointmentEvent.create({
          data: { id: newId('appointmentEvent'), appointmentId: id, action: 'OFFER', fromStatus: null, toStatus: 'PENDING', actor: 'SYSTEM', reason: 'Waitlist offer' },
        });
        const { createBookingLead } = await import('../leads/service');
        await createBookingLead(tx, created, now);
        await emitInTransaction(tx, 'WAITLIST_SLOT_OFFERED', {
          waitlistEntryId: entry.id,
          appointmentId: id,
          patientUserId: entry.patientUserId,
          dentistProfileId: practice.dentistProfileId,
          startsAt: slot.startsAt,
          expiresAt: new Date(holdUntil).toISOString(),
        }, { actor: 'system' });
        return id;
      });
      if (holdId) return holdId;
    } catch (error) {
      // The slot went to someone else in the meantime: nothing to offer.
      if (isOverlapViolation(error)) return null;
      throw error;
    }
  }
  return null;
}
