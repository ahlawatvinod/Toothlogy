/**
 * TOOTHLOGY APPOINTMENTS — booking and the controlled lifecycle
 *
 * NO DOUBLE BOOKING, IN THREE LAYERS
 * 1. The slot is re-validated inside the booking transaction, after taking a
 *    row lock on the branch (serialising chair capacity) and on the dentist.
 * 2. The database refuses overlap outright: an exclusion constraint on
 *    (dentist, [startsAt, occupiedUntil)) for every active status. Whatever
 *    the application does, two active appointments of one dentist cannot
 *    overlap.
 * 3. A replayed request — a double tap, a network retry, a refresh — carries
 *    the same booking key and returns the appointment it already created.
 *
 * STATUS CHANGES GO THROUGH ONE DOOR
 * `transition` is the only function that changes `status`. It resolves who is
 * acting (the patient, the practice, or the system), checks the transition is
 * allowed from the current state for that actor, updates with the current
 * status as a guard (so two concurrent confirmations cannot both succeed),
 * and writes the event row, the audit record and the outbox event in the same
 * transaction. Nothing else in the codebase writes `status`.
 *
 * Someone who is neither the patient nor the practice is told the
 * appointment does not exist — not that they may not see it.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import * as zoned from '@/lib/zoned-time';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { can, isAuthenticated, type Principal } from '../rbac';
import { distanceMetres } from '../location';
import {
  ACTIVE_STATUSES,
  generateSlots,
  loadAvailabilityContext,
  localDateOf,
  resolveService,
  typeIneligibility,
  type SlotAppointmentType,
} from './availability';

type Tx = Prisma.TransactionClient;
export type AppointmentStatus =
  | 'REQUESTED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW'
  | 'EXPIRED';
export type Actor = 'PATIENT' | 'PRACTICE' | 'SYSTEM';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** How long a practice has to answer a request, at most. */
const REQUEST_RESPONSE_HOURS = 24;
/** Patients may move an appointment this many times. */
const PATIENT_RESCHEDULE_LIMIT = 3;
/** Check-in opens this long before the start. */
const CHECK_IN_WINDOW_MINUTES = 60;
/** A cancellation closer than this to the start is recorded as late. */
const LATE_CANCELLATION_HOURS = 2;

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const bookingSchema = z
  .object({
    practiceId: z.string().min(1).max(64),
    serviceOfferingId: z.string().max(64).nullable().optional(),
    type: z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT']).default('CLINIC'),
    startsAt: z.string().datetime({ offset: true }),
    emergency: z.boolean().default(false),
    dependentId: z.string().max(64).nullable().optional(),
    patientNote: z.string().trim().max(1000).optional(),
    visit: z
      .object({
        address: z.string().trim().min(5).max(300),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .optional(),
    source: z.enum(['SEARCH', 'PROFILE', 'CLINIC_PAGE', 'REBOOK', 'FOLLOW_UP']).default('PROFILE'),
    rebookedFromId: z.string().max(64).optional(),
    /** The sponsored click that led here, if any: attribution only, never price. */
    sponsoredClickId: z.string().max(64).optional(),
  })
  .refine((v) => v.type !== 'HOME_VISIT' || v.visit !== undefined, {
    message: 'A home visit needs the address to visit.',
    path: ['visit'],
  });

export type BookingInput = z.input<typeof bookingSchema>;

function isOverlapViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('appointments_no_dentist_overlap') || text.includes('23P01');
}

function requestExpiry(now: Date, startsAt: Date, hours: number): Date {
  const byWindow = now.getTime() + hours * HOUR;
  const beforeStart = startsAt.getTime() - 15 * MINUTE;
  return new Date(Math.max(now.getTime() + 15 * MINUTE, Math.min(byWindow, beforeStart)));
}

/** Lock the branch and the dentist rows, serialising bookings that compete. */
async function lockForBooking(tx: Tx, locationId: string, dentistProfileId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "locations" WHERE "id" = ${locationId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "dentist_profiles" WHERE "id" = ${dentistProfileId} FOR UPDATE`;
}

/** Throws unless `startsAt` is a bookable slot right now, inside `tx`. */
async function assertSlotBookable(
  tx: Tx,
  params: {
    practiceId: string;
    timezone: string;
    startsAt: Date;
    type: SlotAppointmentType;
    durationMinutes: number;
    serviceTypes: readonly string[];
    emergency: boolean;
    excludeAppointmentId?: string;
    now: Date;
  },
): Promise<{ endsAt: Date; occupiedUntil: Date }> {
  const date = localDateOf(params.startsAt, params.timezone);
  const context = await loadAvailabilityContext(params.practiceId, date, date, {
    client: tx,
    excludeAppointmentId: params.excludeAppointmentId,
  });
  if (context.blockedReason) throw errors.preconditionFailed(context.blockedReason);
  const ineligible = typeIneligibility(context, {
    type: params.type,
    serviceTypes: params.serviceTypes,
    emergency: params.emergency,
  });
  if (ineligible) throw errors.validation(ineligible, { field: 'type' });

  if (params.startsAt.getTime() <= params.now.getTime()) {
    throw errors.validation('That time has already passed. Choose a later slot.', { field: 'startsAt' });
  }
  const slots = generateSlots(context, {
    type: params.type,
    durationMinutes: params.durationMinutes,
    serviceTypes: params.serviceTypes,
    emergency: params.emergency,
    fromDate: date,
    toDate: date,
    now: params.now,
  });
  const slot = slots.find((s) => s.startsAt === params.startsAt.toISOString());
  if (!slot) throw errors.conflict('That time is no longer available. Choose another slot.');
  return { endsAt: new Date(slot.endsAt), occupiedUntil: new Date(slot.occupiedUntil) };
}

export async function bookAppointment(
  principal: Principal,
  rawInput: BookingInput,
  context: { bookingKey?: string; requestId?: string; now?: Date } = {},
) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const parsed = bookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The booking details are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    });
  }
  const input = parsed.data;
  const now = context.now ?? new Date();
  const patientUserId = principal.userId;

  // A replay of the same request returns what it created the first time.
  if (context.bookingKey) {
    const existing = await db().appointment.findUnique({
      where: { patientUserId_bookingKey: { patientUserId, bookingKey: context.bookingKey } },
    });
    if (existing) return { appointment: existing, replayed: true };
  }

  const practice = await db().dentistPractice.findUnique({
    where: { id: input.practiceId },
    include: {
      dentistProfile: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
      location: { select: { id: true, organizationId: true, timezone: true, latitude: true, longitude: true, homeVisitRadiusKm: true } },
    },
  });
  if (!practice) throw errors.notFound('Practice');
  if (practice.dentistProfile.userId === patientUserId) {
    throw errors.validation('You cannot book an appointment with yourself.');
  }

  if (input.dependentId) {
    const dependent = await db().dependent.findFirst({
      where: { id: input.dependentId, guardianUserId: patientUserId, deletedAt: null },
    });
    if (!dependent) throw errors.validation('Choose one of your own family members.', { field: 'dependentId' });
  }

  if (input.type === 'HOME_VISIT' && input.visit) {
    const { latitude, longitude, homeVisitRadiusKm } = practice.location;
    if (latitude === null || longitude === null || homeVisitRadiusKm === null) {
      throw errors.validation('This branch does not make home visits.', { field: 'type' });
    }
    const metres = distanceMetres(
      { latitude: Number(latitude), longitude: Number(longitude) },
      { latitude: input.visit.latitude, longitude: input.visit.longitude },
    );
    if (metres > homeVisitRadiusKm * 1000) {
      throw errors.validation(`That address is outside this branch's ${homeVisitRadiusKm} km home-visit area.`, { field: 'visit' });
    }
  }

  const service = await resolveService(practice.id, input.serviceOfferingId);
  const startsAt = new Date(input.startsAt);
  // A booking that followed a sponsored click is attributed to that campaign —
  // only if the click is real, counted, recent and for this practice.
  const { attributedCampaign } = await import('../sponsored/serve');
  const campaignId = await attributedCampaign(input.sponsoredClickId, practice.id, now);
  // A patient referred to this dentist at a recent camp: attributed to that visit.
  const { campReferralFor } = await import('../camps/service');
  const campRegistrationId = await campReferralFor(patientUserId, practice.dentistProfileId, now);
  const instant = practice.autoConfirm && !input.emergency;
  const status: AppointmentStatus = instant ? 'CONFIRMED' : 'REQUESTED';

  try {
    const appointment = await transaction(async (tx) => {
      await lockForBooking(tx, practice.location.id, practice.dentistProfileId);
      const { endsAt, occupiedUntil } = await assertSlotBookable(tx, {
        practiceId: practice.id,
        timezone: practice.location.timezone,
        startsAt,
        type: input.type,
        durationMinutes: service.durationMinutes,
        serviceTypes: service.types,
        emergency: input.emergency,
        now,
      });

      const id = newId('appointment');
      const created = await tx.appointment.create({
        data: {
          id,
          patientUserId,
          dependentId: input.dependentId ?? null,
          practiceId: practice.id,
          dentistProfileId: practice.dentistProfileId,
          locationId: practice.location.id,
          organizationId: practice.location.organizationId,
          serviceOfferingId: service.offering?.id ?? null,
          serviceName: service.name,
          priceMinor: service.offering?.priceMinor ?? practice.consultationFeeMinor ?? null,
          priceMaxMinor: service.offering?.priceMaxMinor ?? null,
          currency: service.offering?.currency ?? null,
          startsAt,
          endsAt,
          occupiedUntil,
          timezone: practice.location.timezone,
          type: input.type,
          mode: instant ? 'INSTANT' : 'REQUEST',
          isEmergency: input.emergency,
          usesChair: input.type === 'CLINIC',
          status,
          source: input.source,
          patientNote: input.patientNote ?? null,
          visitAddress: input.visit?.address ?? null,
          visitLatitude: input.visit?.latitude ?? null,
          visitLongitude: input.visit?.longitude ?? null,
          expiresAt: instant ? null : requestExpiry(now, startsAt, REQUEST_RESPONSE_HOURS),
          confirmedAt: instant ? now : null,
          rebookedFromId: input.rebookedFromId ?? null,
          campRegistrationId,
          bookingKey: context.bookingKey ?? null,
          bookingMetadata: {
            requestId: context.requestId ?? null,
            ...(campaignId ? { sponsoredClickId: input.sponsoredClickId ?? null, campaignId } : {}),
          },
        },
      });

      await tx.appointmentEvent.create({
        data: {
          id: newId('appointmentEvent'),
          appointmentId: id,
          action: 'BOOK',
          fromStatus: null,
          toStatus: status,
          actor: 'PATIENT',
          actorUserId: patientUserId,
        },
      });

      const payload = eventPayload(created);
      await emitInTransaction(tx, 'APPOINTMENT_CREATED', { ...payload, mode: created.mode }, { requestId: context.requestId, actor: patientUserId });
      if (instant) {
        await emitInTransaction(tx, 'APPOINTMENT_CONFIRMED', payload, { requestId: context.requestId, actor: patientUserId });
      }

      // The lead is born with the booking, in the same transaction: a booking
      // can never exist without its lead, or a lead without its booking.
      const { createBookingLead } = await import('../leads/service');
      await createBookingLead(tx, created, now, campaignId);

      return created;
    });

    await recordAuditEvent({
      action: 'APPOINTMENT_BOOKED',
      actor: patientUserId,
      subject: appointment.id,
      outcome: 'success',
      organizationId: appointment.organizationId,
      requestId: context.requestId,
      detail: { status: appointment.status, type: appointment.type },
    });
    return { appointment, replayed: false };
  } catch (error) {
    if (isOverlapViolation(error)) {
      throw errors.conflict('That time was just taken by someone else. Choose another slot.');
    }
    // Two identical requests racing each other with one key: the loser finds
    // the winner's row.
    if (context.bookingKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await db().appointment.findUnique({
        where: { patientUserId_bookingKey: { patientUserId, bookingKey: context.bookingKey } },
      });
      if (existing) return { appointment: existing, replayed: true };
    }
    throw error;
  }
}

function eventPayload(a: {
  id: string;
  patientUserId: string;
  dentistProfileId: string;
  organizationId: string;
  locationId: string;
  practiceId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
}) {
  return {
    appointmentId: a.id,
    patientUserId: a.patientUserId,
    dentistProfileId: a.dentistProfileId,
    organizationId: a.organizationId,
    locationId: a.locationId,
    practiceId: a.practiceId,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
  };
}

// ---------------------------------------------------------------------------
// Who is acting
// ---------------------------------------------------------------------------

type AppointmentRow = NonNullable<Awaited<ReturnType<typeof loadAppointment>>>;

async function loadAppointment(id: string) {
  return db().appointment.findUnique({
    where: { id },
    include: { dentistProfile: { select: { userId: true } } },
  });
}

/** The patient, the practice (the dentist, or clinic staff with the permission), or nobody. */
export function actorFor(principal: Principal, appointment: { patientUserId: string; organizationId: string; dentistProfile: { userId: string } }): Actor | null {
  if (principal.kind === 'system') return 'SYSTEM';
  if (!isAuthenticated(principal)) return null;
  if (appointment.dentistProfile.userId === principal.userId) return 'PRACTICE';
  if (can(principal, 'tl.appointment.diary.manage', { organizationId: appointment.organizationId })) return 'PRACTICE';
  if (appointment.patientUserId === principal.userId) return 'PATIENT';
  return null;
}

async function loadForActor(principal: Principal, appointmentId: string): Promise<{ appointment: AppointmentRow; actor: Actor }> {
  const appointment = await loadAppointment(appointmentId);
  const actor = appointment ? actorFor(principal, appointment) : null;
  // Not found, not forbidden: whether an appointment id exists is private.
  if (!appointment || !actor) throw errors.notFound('Appointment');
  return { appointment, actor };
}

// ---------------------------------------------------------------------------
// The lifecycle
// ---------------------------------------------------------------------------

export type TransitionAction =
  | 'CONFIRM'
  | 'REJECT'
  | 'CANCEL'
  | 'CHECK_IN'
  | 'START'
  | 'COMPLETE'
  | 'NO_SHOW'
  | 'EXPIRE'
  | 'ACCEPT';

interface TransitionRule {
  readonly from: readonly AppointmentStatus[];
  readonly actors: readonly Actor[];
  /** Fixed target, or decided from the appointment (ACCEPT). */
  readonly to: AppointmentStatus | 'DECIDE';
  readonly event?: string;
}

/**
 * The whole state machine. Anything not listed here is refused.
 *
 * - CANCEL is allowed until the visit begins; after check-in the practice
 *   records a no-show or completes instead.
 * - ACCEPT is the patient taking up a PENDING hold (a waitlist offer or a time
 *   the practice proposed): it becomes CONFIRMED where the practice takes
 *   instant bookings, REQUESTED otherwise.
 */
export const TRANSITIONS: Readonly<Record<TransitionAction, TransitionRule>> = {
  CONFIRM: { from: ['REQUESTED'], actors: ['PRACTICE'], to: 'CONFIRMED', event: 'APPOINTMENT_CONFIRMED' },
  REJECT: { from: ['REQUESTED'], actors: ['PRACTICE'], to: 'REJECTED', event: 'APPOINTMENT_REJECTED' },
  CANCEL: { from: ['REQUESTED', 'PENDING', 'CONFIRMED'], actors: ['PATIENT', 'PRACTICE'], to: 'CANCELLED', event: 'APPOINTMENT_CANCELLED' },
  CHECK_IN: { from: ['CONFIRMED'], actors: ['PATIENT', 'PRACTICE'], to: 'CHECKED_IN', event: 'APPOINTMENT_CHECKED_IN' },
  START: { from: ['CHECKED_IN'], actors: ['PRACTICE'], to: 'IN_PROGRESS' },
  COMPLETE: { from: ['CHECKED_IN', 'IN_PROGRESS'], actors: ['PRACTICE'], to: 'COMPLETED', event: 'APPOINTMENT_COMPLETED' },
  NO_SHOW: { from: ['CONFIRMED'], actors: ['PRACTICE'], to: 'NO_SHOW', event: 'APPOINTMENT_NO_SHOW' },
  EXPIRE: { from: ['REQUESTED', 'PENDING'], actors: ['SYSTEM'], to: 'EXPIRED', event: 'APPOINTMENT_EXPIRED' },
  ACCEPT: { from: ['PENDING'], actors: ['PATIENT'], to: 'DECIDE' },
};

export const transitionSchema = z.object({
  action: z.enum(['CONFIRM', 'REJECT', 'CANCEL', 'CHECK_IN', 'START', 'COMPLETE', 'NO_SHOW', 'ACCEPT']),
  reason: z.string().trim().max(500).optional(),
  practiceNote: z.string().trim().max(2000).optional(),
  followUpInDays: z.number().int().min(1).max(730).optional(),
  followUpNote: z.string().trim().max(500).optional(),
});

export type TransitionInput = z.infer<typeof transitionSchema>;

export async function transition(
  principal: Principal,
  appointmentId: string,
  action: TransitionAction,
  input: Omit<TransitionInput, 'action'> = {},
  context: { requestId?: string; now?: Date } = {},
) {
  const now = context.now ?? new Date();
  const { appointment, actor } = await loadForActor(principal, appointmentId);
  const rule = TRANSITIONS[action];

  if (!rule.actors.includes(actor)) {
    throw errors.forbidden(`appointment.${action.toLowerCase()}`);
  }
  if (!rule.from.includes(appointment.status as AppointmentStatus)) {
    throw errors.preconditionFailed(`An appointment that is ${appointment.status.toLowerCase().replace('_', ' ')} cannot be ${verb(action)}.`);
  }
  if ((action === 'REJECT' || (action === 'CANCEL' && actor === 'PRACTICE')) && !input.reason) {
    throw errors.validation('Give the patient a reason.', { field: 'reason' });
  }
  if (action === 'ACCEPT' && appointment.patientUserId !== (isAuthenticated(principal) ? principal.userId : '')) {
    throw errors.notFound('Appointment');
  }
  if (action === 'CHECK_IN') {
    const opens = appointment.startsAt.getTime() - CHECK_IN_WINDOW_MINUTES * MINUTE;
    if (now.getTime() < opens) throw errors.preconditionFailed(`Check-in opens ${CHECK_IN_WINDOW_MINUTES} minutes before the appointment.`);
    if (now.getTime() > appointment.endsAt.getTime()) throw errors.preconditionFailed('This appointment has already ended.');
  }
  if (action === 'NO_SHOW' && now.getTime() < appointment.startsAt.getTime()) {
    throw errors.preconditionFailed('A no-show can only be recorded after the start time.');
  }
  if (action === 'EXPIRE' && (!appointment.expiresAt || appointment.expiresAt.getTime() > now.getTime())) {
    throw errors.preconditionFailed('This appointment has not expired.');
  }

  let to: AppointmentStatus = rule.to === 'DECIDE' ? 'CONFIRMED' : rule.to;
  if (action === 'ACCEPT') {
    if (appointment.expiresAt && appointment.expiresAt.getTime() <= now.getTime()) {
      throw errors.preconditionFailed('This offer has expired.');
    }
    const practice = await db().dentistPractice.findUnique({ where: { id: appointment.practiceId }, select: { autoConfirm: true } });
    to = practice?.autoConfirm ? 'CONFIRMED' : 'REQUESTED';
  }

  const lateCancellation =
    action === 'CANCEL' && appointment.startsAt.getTime() - now.getTime() < LATE_CANCELLATION_HOURS * HOUR;
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;

  const updated = await transaction(async (tx) => {
    const data: Prisma.AppointmentUpdateManyMutationInput = { status: to };
    if (to === 'CONFIRMED') Object.assign(data, { confirmedAt: now, expiresAt: null });
    if (to === 'REQUESTED') Object.assign(data, { expiresAt: requestExpiry(now, appointment.startsAt, REQUEST_RESPONSE_HOURS) });
    if (to === 'REJECTED') Object.assign(data, { rejectionReason: input.reason ?? null });
    if (to === 'CANCELLED') Object.assign(data, { cancelledAt: now, cancelledBy: actor, cancellationReason: input.reason ?? null });
    if (appointment.waitlistEntryId && (to === 'EXPIRED' || to === 'CANCELLED')) {
      // A lapsed or declined hold lets go of its waitlist entry, so the entry
      // can be offered the next opening. The link survives in the metadata.
      Object.assign(data, { waitlistEntryId: null, bookingMetadata: { waitlistEntryId: appointment.waitlistEntryId, holdEnded: to } });
    }
    if (to === 'CHECKED_IN') Object.assign(data, { checkedInAt: now });
    if (to === 'IN_PROGRESS') Object.assign(data, { startedAt: now });
    if (to === 'COMPLETED') {
      Object.assign(data, {
        completedAt: now,
        practiceNote: input.practiceNote ?? appointment.practiceNote,
        followUpDueAt: input.followUpInDays ? new Date(now.getTime() + input.followUpInDays * 24 * HOUR) : null,
        followUpNote: input.followUpNote ?? null,
      });
    }

    // The status guard: if anything moved this appointment since we read it,
    // nothing is written and the caller hears about it.
    const result = await tx.appointment.updateMany({ where: { id: appointment.id, status: appointment.status }, data });
    if (result.count === 0) throw errors.conflict('This appointment changed while you were acting on it. Refresh and try again.');

    await tx.appointmentEvent.create({
      data: {
        id: newId('appointmentEvent'),
        appointmentId: appointment.id,
        action,
        fromStatus: appointment.status,
        toStatus: to,
        actor,
        actorUserId,
        reason: input.reason ?? null,
        detail: lateCancellation ? { lateCancellation: true } : undefined,
      },
    });

    if (appointment.waitlistEntryId && (to === 'CONFIRMED' || to === 'REQUESTED')) {
      await tx.waitlistEntry.update({ where: { id: appointment.waitlistEntryId }, data: { status: 'BOOKED' } });
    }
    if (appointment.waitlistEntryId && (to === 'EXPIRED' || to === 'CANCELLED')) {
      // The patient let the hold go: back into the queue for the next opening.
      await tx.waitlistEntry.updateMany({
        where: { id: appointment.waitlistEntryId, status: 'OFFERED' },
        data: { status: 'ACTIVE' },
      });
    }

    const fresh = await tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    const payload = { ...eventPayload(fresh), action, actor, reason: input.reason ?? null, lateCancellation };
    const event = rule.event ?? (to === 'CONFIRMED' ? 'APPOINTMENT_CONFIRMED' : null);
    if (event) await emitInTransaction(tx, event, payload, { requestId: context.requestId, actor: actorUserId ?? 'system' });
    return fresh;
  });

  await recordAuditEvent({
    action: `APPOINTMENT_${action}`,
    actor: actorUserId ?? 'system',
    subject: appointment.id,
    outcome: 'success',
    organizationId: appointment.organizationId,
    requestId: context.requestId,
    detail: { from: appointment.status, to, actor },
  });
  return updated;
}

function verb(action: TransitionAction): string {
  const map: Record<TransitionAction, string> = {
    CONFIRM: 'confirmed',
    REJECT: 'declined',
    CANCEL: 'cancelled',
    CHECK_IN: 'checked in',
    START: 'started',
    COMPLETE: 'completed',
    NO_SHOW: 'marked as a no-show',
    EXPIRE: 'expired',
    ACCEPT: 'accepted',
  };
  return map[action];
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Move an appointment to a new slot, atomically: the new slot is validated
 * with this appointment's own time excluded, and the row is updated in place
 * under the same locks and constraint as a booking, so the old time is
 * released in the very statement that takes the new one.
 *
 * A patient's move is confirmed at once where the practice takes instant
 * bookings, otherwise it becomes a request. A practice's move becomes PENDING:
 * the patient must accept the new time.
 */
export async function rescheduleAppointment(
  principal: Principal,
  appointmentId: string,
  rawInput: z.infer<typeof rescheduleSchema>,
  context: { requestId?: string; now?: Date } = {},
) {
  const input = rescheduleSchema.parse(rawInput);
  const now = context.now ?? new Date();
  const { appointment, actor } = await loadForActor(principal, appointmentId);
  if (actor === 'SYSTEM') throw errors.forbidden('appointment.reschedule');
  if (!['REQUESTED', 'PENDING', 'CONFIRMED'].includes(appointment.status)) {
    throw errors.preconditionFailed(`An appointment that is ${appointment.status.toLowerCase()} cannot be moved.`);
  }
  if (actor === 'PATIENT' && appointment.rescheduleCount >= PATIENT_RESCHEDULE_LIMIT) {
    throw errors.preconditionFailed('This appointment has been moved the maximum number of times. Cancel and book again instead.');
  }
  if (actor === 'PRACTICE' && !input.reason) throw errors.validation('Tell the patient why the time is changing.', { field: 'reason' });

  const startsAt = new Date(input.startsAt);
  if (startsAt.getTime() === appointment.startsAt.getTime()) throw errors.validation('Choose a different time.', { field: 'startsAt' });

  const [practice, service] = await Promise.all([
    db().dentistPractice.findUniqueOrThrow({ where: { id: appointment.practiceId }, select: { autoConfirm: true } }),
    resolveService(appointment.practiceId, appointment.serviceOfferingId),
  ]);
  const to: AppointmentStatus = actor === 'PRACTICE' ? 'PENDING' : practice.autoConfirm ? 'CONFIRMED' : 'REQUESTED';
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;

  try {
    const updated = await transaction(async (tx) => {
      await lockForBooking(tx, appointment.locationId, appointment.dentistProfileId);
      const { endsAt, occupiedUntil } = await assertSlotBookable(tx, {
        practiceId: appointment.practiceId,
        timezone: appointment.timezone,
        startsAt,
        type: appointment.type,
        durationMinutes: service.durationMinutes,
        serviceTypes: service.types,
        emergency: appointment.isEmergency,
        excludeAppointmentId: appointment.id,
        now,
      });
      const result = await tx.appointment.updateMany({
        where: { id: appointment.id, status: appointment.status, startsAt: appointment.startsAt },
        data: {
          startsAt,
          endsAt,
          occupiedUntil,
          status: to,
          confirmedAt: to === 'CONFIRMED' ? now : null,
          // A request waits for the practice, a proposal for the patient: the
          // same response window either way.
          expiresAt: to === 'CONFIRMED' ? null : requestExpiry(now, startsAt, REQUEST_RESPONSE_HOURS),
          // Reminders are keyed to the start they were for, so the new time
          // is reminded afresh without clearing anything here.
          rescheduleCount: { increment: 1 },
        },
      });
      if (result.count === 0) throw errors.conflict('This appointment changed while you were moving it. Refresh and try again.');

      await tx.appointmentEvent.create({
        data: {
          id: newId('appointmentEvent'),
          appointmentId: appointment.id,
          action: 'RESCHEDULE',
          fromStatus: appointment.status,
          toStatus: to,
          actor,
          actorUserId,
          reason: input.reason ?? null,
          detail: { from: appointment.startsAt.toISOString(), to: startsAt.toISOString() },
        },
      });
      const fresh = await tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      await emitInTransaction(
        tx,
        'APPOINTMENT_RESCHEDULED',
        { ...eventPayload(fresh), previousStartsAt: appointment.startsAt.toISOString(), previousEndsAt: appointment.endsAt.toISOString(), actor },
        { requestId: context.requestId, actor: actorUserId ?? 'system' },
      );
      return fresh;
    });

    await recordAuditEvent({
      action: 'APPOINTMENT_RESCHEDULE',
      actor: actorUserId ?? 'system',
      subject: appointment.id,
      outcome: 'success',
      organizationId: appointment.organizationId,
      requestId: context.requestId,
      detail: { from: appointment.startsAt.toISOString(), to: startsAt.toISOString(), actor, status: to },
    });
    return updated;
  } catch (error) {
    if (isOverlapViolation(error)) throw errors.conflict('That time was just taken by someone else. Choose another slot.');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const DETAIL_INCLUDE = {
  dentistProfile: { select: { slug: true, userId: true, user: { select: { displayName: true } } } },
  location: { select: { name: true, phone: true, timezone: true, address: { select: { lines: true, locality: true } } } },
  organization: { select: { name: true, slug: true } },
  dependent: { select: { name: true, relationship: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.AppointmentInclude;

/** One appointment, for its patient or its practice only. */
export async function getAppointment(principal: Principal, appointmentId: string) {
  const { actor } = await loadForActor(principal, appointmentId);
  const appointment = await db().appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: {
      ...DETAIL_INCLUDE,
      // The practice sees who the patient is and how to reach them; the patient
      // already knows. Nobody else reaches this line.
      patient: { select: { displayName: true, email: true, phone: true } },
    },
  });
  return { appointment, actor };
}

export const PATIENT_GROUPS = {
  upcoming: ['REQUESTED', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'],
  past: ['COMPLETED', 'NO_SHOW'],
  cancelled: ['CANCELLED', 'REJECTED', 'EXPIRED'],
} as const;

export async function listPatientAppointments(userId: string) {
  return db().appointment.findMany({
    where: { patientUserId: userId },
    include: DETAIL_INCLUDE,
    orderBy: { startsAt: 'desc' },
    take: 200,
  });
}

/**
 * The practice's diary: appointments with this dentist (their own), or at the
 * organizations where the principal may manage appointments.
 */
export async function listPracticeAppointments(
  principal: Principal,
  filter: { organizationId?: string; from: Date; to: Date; statuses?: readonly string[] },
) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const profile = await db().dentistProfile.findUnique({ where: { userId: principal.userId }, select: { id: true } });
  const manageable = principal.organizations
    .map((o) => o.organizationId)
    .filter((id) => can(principal, 'tl.appointment.diary.manage', { organizationId: id }));
  if (filter.organizationId && !manageable.includes(filter.organizationId)) throw errors.notFound('Organization');

  const scope: Prisma.AppointmentWhereInput[] = [];
  if (filter.organizationId) scope.push({ organizationId: filter.organizationId });
  else {
    if (profile) scope.push({ dentistProfileId: profile.id });
    if (manageable.length > 0) scope.push({ organizationId: { in: manageable } });
  }
  if (scope.length === 0) return [];

  return db().appointment.findMany({
    where: {
      OR: scope,
      startsAt: { gte: filter.from, lt: filter.to },
      ...(filter.statuses && filter.statuses.length > 0 ? { status: { in: filter.statuses as AppointmentStatus[] } } : {}),
    },
    include: {
      ...DETAIL_INCLUDE,
      patient: { select: { displayName: true, email: true, phone: true } },
    },
    orderBy: { startsAt: 'asc' },
    take: 500,
  });
}

// ---------------------------------------------------------------------------
// Jobs: expiry, reminders, follow-ups
// ---------------------------------------------------------------------------

const SYSTEM: Principal = { kind: 'system', actor: 'appointments.jobs' };

/** Lapse requests and holds nobody answered. */
export async function expireStaleAppointments(now: Date = new Date()): Promise<{ expired: number }> {
  const due = await db().appointment.findMany({
    where: { status: { in: ['REQUESTED', 'PENDING'] }, expiresAt: { lte: now } },
    select: { id: true },
    take: 200,
  });
  let expired = 0;
  for (const { id } of due) {
    try {
      await transition(SYSTEM, id, 'EXPIRE', {}, { now });
      expired += 1;
    } catch (error) {
      // Someone acted on it between the read and now: that is fine.
      if (!(error instanceof Error) || !/cannot be|changed while/.test(error.message)) throw error;
    }
  }
  await db().waitlistEntry.updateMany({
    where: { status: 'ACTIVE', latestDate: { lt: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`) } },
    data: { status: 'EXPIRED' },
  });
  return { expired };
}

/**
 * REMINDERS
 *
 * Four kinds, each sent at most once per appointment time:
 * - DAY_BEFORE ("tomorrow"): within 24 hours, on an earlier local date.
 * - TODAY: on the appointment's local date, from 07:00 local, more than two
 *   hours ahead.
 * - SOON: within two hours of the start.
 * - FOLLOW_UP: a completed visit whose recommended follow-up has fallen due.
 *
 * "Local" is the branch's timezone, stored on the appointment. A reminder is
 * claimed by inserting its AppointmentReminder row under a lock on the
 * appointment, after re-checking the status and time: the unique key
 * (appointment, kind, time) means concurrent jobs send it once, a cancelled or
 * completed appointment is never reminded, and a rescheduled one is reminded
 * for its new time.
 */
export const REMINDER_RULES = { soonMinutes: 120, dayBeforeHours: 24, todayFromLocalMinutes: 7 * 60 } as const;

export type TimedReminderKind = 'DAY_BEFORE' | 'TODAY' | 'SOON';
type ReminderKindName = TimedReminderKind | 'FOLLOW_UP';

/** Which reminder, if any, is due now for an appointment starting at `startsAt`. Pure. */
export function reminderKindFor(startsAt: Date, now: Date, timezone: string): TimedReminderKind | null {
  const until = startsAt.getTime() - now.getTime();
  if (until <= 0) return null;
  if (until <= REMINDER_RULES.soonMinutes * MINUTE) return 'SOON';
  if (zoned.localDateOf(startsAt, timezone) === zoned.localDateOf(now, timezone)) {
    return zoned.localMinutesOf(now, timezone) >= REMINDER_RULES.todayFromLocalMinutes ? 'TODAY' : null;
  }
  return until <= REMINDER_RULES.dayBeforeHours * HOUR ? 'DAY_BEFORE' : null;
}

const REMINDER_NOTIFICATION: Record<TimedReminderKind, string> = {
  DAY_BEFORE: 'TL-NOTIF-APPOINTMENT-REMINDER-001',
  TODAY: 'TL-NOTIF-APPOINTMENT-TODAY-001',
  SOON: 'TL-NOTIF-APPOINTMENT-SOON-001',
};

/**
 * Claim one reminder. Returns its id when this caller claimed it, or null when
 * it was already sent, or the appointment is no longer in the expected state
 * at the expected time.
 */
async function claimReminder(
  appointmentId: string,
  kind: ReminderKindName,
  forInstant: Date,
  expect: { status: AppointmentStatus; field: 'startsAt' | 'followUpDueAt' },
  now: Date,
): Promise<string | null> {
  return transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ status: string; startsAt: Date; followUpDueAt: Date | null }>>`
      SELECT "status", "startsAt", "followUpDueAt" FROM "appointments" WHERE "id" = ${appointmentId} FOR UPDATE`;
    const row = rows[0];
    if (!row || row.status !== expect.status) return null;
    const actual = expect.field === 'startsAt' ? row.startsAt : row.followUpDueAt;
    if (!actual || actual.getTime() !== forInstant.getTime()) return null;
    const id = newId('appointmentReminder');
    const inserted = await tx.appointmentReminder.createMany({
      data: [{ id, appointmentId, kind, forInstant, sentAt: now }],
      skipDuplicates: true,
    });
    return inserted.count === 1 ? id : null;
  });
}

export async function sendDueReminders(now: Date = new Date()): Promise<{ dayBefore: number; today: number; soon: number }> {
  const { notifyUser } = await import('../notifications');
  const { formatDateTime } = await import('../i18n');
  const counts = { dayBefore: 0, today: 0, soon: 0 };

  const candidates = await db().appointment.findMany({
    where: { status: 'CONFIRMED', startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_RULES.dayBeforeHours * HOUR) } },
    include: { ...DETAIL_INCLUDE, reminders: { select: { kind: true, forInstant: true } } },
    orderBy: { startsAt: 'asc' },
    take: 500,
  });

  for (const a of candidates) {
    const kind = reminderKindFor(a.startsAt, now, a.timezone);
    if (!kind) continue;
    if (a.reminders.some((r) => r.kind === kind && r.forInstant.getTime() === a.startsAt.getTime())) continue;
    const reminderId = await claimReminder(a.id, kind, a.startsAt, { status: 'CONFIRMED', field: 'startsAt' }, now);
    if (!reminderId) continue;
    await notifyUser({
      userId: a.patientUserId,
      notificationId: REMINDER_NOTIFICATION[kind],
      data: {
        when: formatDateTime(a.startsAt, 'en-IN', a.timezone),
        dentist: a.dentistProfile.user.displayName ?? 'your dentist',
        location: a.location.name,
      },
      linkUrl: `/account/appointments/${a.id}`,
      sourceEventId: reminderId,
    });
    counts[kind === 'DAY_BEFORE' ? 'dayBefore' : kind === 'TODAY' ? 'today' : 'soon'] += 1;
  }
  return counts;
}

/**
 * Follow-ups the dentist asked for, once they fall due — skipped while the
 * patient already has a later visit booked with the same practice.
 */
export async function sendDueFollowUps(now: Date = new Date()): Promise<{ sent: number }> {
  const { notifyUser } = await import('../notifications');
  const due = await db().appointment.findMany({
    where: { status: 'COMPLETED', followUpDueAt: { lte: now }, reminders: { none: { kind: 'FOLLOW_UP' } } },
    include: DETAIL_INCLUDE,
    take: 200,
  });
  let sent = 0;
  for (const a of due) {
    const rebooked = await db().appointment.count({
      where: { patientUserId: a.patientUserId, practiceId: a.practiceId, startsAt: { gt: a.startsAt }, status: { in: ['REQUESTED', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] } },
    });
    if (rebooked > 0) continue;
    const reminderId = await claimReminder(a.id, 'FOLLOW_UP', a.followUpDueAt!, { status: 'COMPLETED', field: 'followUpDueAt' }, now);
    if (!reminderId) continue;
    await notifyUser({
      userId: a.patientUserId,
      notificationId: 'TL-NOTIF-FOLLOW-UP-DUE-001',
      data: { dentist: a.dentistProfile.user.displayName ?? 'your dentist', service: a.followUpNote ?? a.serviceName },
      linkUrl: `/book/${a.dentistProfile.slug}?practice=${a.practiceId}&rebook=${a.id}`,
      sourceEventId: reminderId,
    });
    sent += 1;
  }
  return { sent };
}

export { ACTIVE_STATUSES };
