/**
 * TOOTHLOGY AVAILABILITY ENGINE
 *
 * Answers one question from the database and nothing else: at which instants
 * could this dentist, at this branch, genuinely see a patient for this
 * service and appointment type? No slot is ever invented or hard-coded.
 *
 * TWO LAYERS
 * - `generateSlots` is pure and deterministic: given the same context it
 *   returns the same slots, so the rules can be tested without a database.
 * - `loadAvailabilityContext` reads the real state: clinic hours, the
 *   dentist's sessions, closures, holidays, leave, blocks, existing
 *   appointments and chair use.
 *
 * WHAT MAKES A SLOT BOOKABLE
 * 1. The branch is active, the practice confirmed, the dentist discoverable
 *    and not paused.
 * 2. The day is not a closure, and not a public holiday the branch observes.
 * 3. The span lies inside a working window: the dentist's sessions for that
 *    weekday (split shifts; the gap between two sessions is the break), or
 *    the branch's hours when the dentist has set none. Clinic visits are also
 *    confined to the branch's hours.
 * 4. It starts after the minimum notice (emergencies skip it) and within the
 *    booking window, and never in the past.
 * 5. [start, end + buffer) touches no leave, block or other active
 *    appointment of this dentist.
 * 6. A clinic visit leaves a chair free: concurrent chair-using appointments
 *    at the branch stay below `chairs`.
 * 7. The appointment type is allowed by both the practice and the service.
 *
 * TIME
 * Working hours are wall-clock minutes in the branch's timezone; everything
 * else is an instant (UTC). Conversion happens once, here.
 */

import { db } from '../db/client';
import { errors } from '../kernel/errors';
import { addDays, localDateOf, localMinutesOf, zonedToUtc } from '@/lib/zoned-time';

export type SlotAppointmentType = 'CLINIC' | 'VIDEO' | 'HOME_VISIT';

const ACTIVE_STATUSES = ['REQUESTED', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'] as const;
export { ACTIVE_STATUSES };

const MINUTE = 60_000;
const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

// The time arithmetic lives in src/lib/zoned-time.ts so the browser's slot
// picker uses exactly the same conversion; re-exported here for callers.
export { addDays, localDateOf, localMinutesOf, zonedToUtc };

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Context and the pure generator
// ---------------------------------------------------------------------------

export interface Window {
  readonly start: number;
  readonly end: number;
}

export interface Busy {
  readonly start: Date;
  readonly end: Date;
}

export interface AvailabilityContext {
  readonly practiceId: string;
  readonly timezone: string;
  /** Why nothing is bookable at all, or null. */
  readonly blockedReason: string | null;
  readonly clinicHours: ReadonlyMap<number, readonly Window[]>;
  /** Dentist sessions per weekday, with the types each takes. Null: none set. */
  readonly dentistRules: ReadonlyArray<{ dayOfWeek: number; start: number; end: number; types: readonly string[] }> | null;
  /** Local dates the branch is shut: closures and observed holidays. */
  readonly closedDates: ReadonlySet<string>;
  readonly exceptions: readonly Busy[];
  /** This dentist's active appointments, [startsAt, occupiedUntil). */
  readonly dentistBusy: readonly Busy[];
  /** Chair-using appointments at the branch, all dentists. */
  readonly chairBusy: readonly Busy[];
  readonly chairs: number;
  readonly slotMinutes: number;
  readonly bufferMinutes: number;
  readonly minNoticeMinutes: number;
  readonly maxAdvanceDays: number;
  readonly accepts: { readonly video: boolean; readonly homeVisit: boolean; readonly emergency: boolean };
}

export interface SlotRequest {
  readonly type: SlotAppointmentType;
  readonly durationMinutes: number;
  /** Types the chosen service allows; empty/undefined: any. */
  readonly serviceTypes?: readonly string[];
  readonly emergency?: boolean;
  readonly fromDate: string;
  readonly toDate: string;
  readonly now: Date;
}

export interface Slot {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly occupiedUntil: string;
  readonly localDate: string;
  readonly localTime: string;
}

function overlaps(aStart: number, aEnd: number, b: Busy): boolean {
  return aStart < b.end.getTime() && b.start.getTime() < aEnd;
}

function intersect(a: readonly Window[], b: readonly Window[]): Window[] {
  const out: Window[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Why a type cannot be booked with this practice and service, or null. */
export function typeIneligibility(context: AvailabilityContext, request: Pick<SlotRequest, 'type' | 'serviceTypes' | 'emergency'>): string | null {
  const allowed = request.serviceTypes && request.serviceTypes.length > 0 ? request.serviceTypes : null;
  if (allowed && !allowed.includes(request.type)) return 'This service is not offered as that kind of appointment.';
  if (request.type === 'VIDEO' && !context.accepts.video) return 'This dentist does not take video consultations here.';
  if (request.type === 'HOME_VISIT' && !context.accepts.homeVisit) return 'This dentist does not make home visits from this branch.';
  if (request.emergency && !context.accepts.emergency) return 'This dentist does not take emergency appointments here.';
  return null;
}

function windowsFor(context: AvailabilityContext, date: string, type: SlotAppointmentType): Window[] {
  const day = weekdayOf(date);
  const clinic = [...(context.clinicHours.get(day) ?? [])];
  if (context.dentistRules === null) return clinic;
  const dentist = context.dentistRules
    .filter((r) => r.dayOfWeek === day && (r.types.length === 0 || r.types.includes(type)))
    .map((r) => ({ start: r.start, end: r.end }));
  // A chair is only available while the clinic is open; video and home
  // visits follow the dentist's own sessions.
  return type === 'CLINIC' ? intersect(dentist, clinic) : dentist.sort((p, q) => p.start - q.start);
}

/**
 * Every bookable slot in [fromDate, toDate] (local dates, inclusive).
 * Deterministic for a given context, request and `now`.
 */
export function generateSlots(context: AvailabilityContext, request: SlotRequest): Slot[] {
  if (context.blockedReason) return [];
  if (typeIneligibility(context, request)) return [];
  if (request.durationMinutes <= 0) return [];

  const nowMs = request.now.getTime();
  const earliest = request.emergency ? nowMs : nowMs + context.minNoticeMinutes * MINUTE;
  const latest = nowMs + context.maxAdvanceDays * DAY;
  const step = Math.max(5, context.slotMinutes);
  const slots: Slot[] = [];

  for (let date = request.fromDate; date <= request.toDate; date = addDays(date, 1)) {
    if (context.closedDates.has(date)) continue;
    for (const window of windowsFor(context, date, request.type)) {
      for (let minute = window.start; minute + request.durationMinutes <= window.end; minute += step) {
        const start = zonedToUtc(date, minute, context.timezone).getTime();
        if (start < earliest || start > latest) continue;
        const end = start + request.durationMinutes * MINUTE;
        const occupied = end + context.bufferMinutes * MINUTE;

        if (context.exceptions.some((b) => overlaps(start, occupied, b))) continue;
        if (context.dentistBusy.some((b) => overlaps(start, occupied, b))) continue;
        if (request.type === 'CLINIC') {
          const concurrent = context.chairBusy.filter((b) => overlaps(start, end, b)).length;
          if (concurrent >= context.chairs) continue;
        }

        slots.push({
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(end).toISOString(),
          occupiedUntil: new Date(occupied).toISOString(),
          localDate: date,
          localTime: hhmm(minute),
        });
      }
    }
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Loading the real state
// ---------------------------------------------------------------------------

type Tx = Pick<ReturnType<typeof db>, 'dentistPractice' | 'appointment' | 'holiday'>;

/**
 * Everything `generateSlots` needs for one practice between two local dates.
 * Pass `excludeAppointmentId` when moving an appointment, so its own current
 * time does not block the new one.
 */
export async function loadAvailabilityContext(
  practiceId: string,
  fromDate: string,
  toDate: string,
  options: { client?: Tx; excludeAppointmentId?: string } = {},
): Promise<AvailabilityContext> {
  const client = options.client ?? db();
  const practice = await client.dentistPractice.findUnique({
    where: { id: practiceId },
    include: {
      dentistProfile: { select: { isDiscoverable: true, deletedAt: true } },
      availabilityRules: true,
      location: {
        include: {
          businessHours: true,
          closures: true,
          organization: { select: { countryCode: true, status: true, deletedAt: true } },
        },
      },
    },
  });
  if (!practice) throw errors.notFound('Practice');
  const location = practice.location;
  const timezone = location.timezone;

  const blockedReason =
    location.deletedAt !== null || location.status !== 'ACTIVE'
      ? 'This branch is not taking appointments.'
      : location.organization.deletedAt !== null || !['ACTIVE', 'PENDING'].includes(location.organization.status)
        ? 'This clinic is not taking appointments.'
        : !practice.isConfirmed
          ? 'The clinic has not confirmed this dentist works here.'
          : !practice.dentistProfile.isDiscoverable || practice.dentistProfile.deletedAt !== null
            ? 'This dentist is not currently listed.'
            : practice.bookingPaused
              ? 'This dentist is not taking new bookings here at the moment.'
              : null;

  const rangeStart = zonedToUtc(fromDate, 0, timezone);
  const rangeEnd = zonedToUtc(addDays(toDate, 1), 0, timezone);

  const clinicHours = new Map<number, Window[]>();
  for (const h of location.businessHours) {
    clinicHours.set(h.dayOfWeek, [...(clinicHours.get(h.dayOfWeek) ?? []), { start: h.opensAtMinutes, end: h.closesAtMinutes }]);
  }

  const closedDates = new Set<string>();
  for (const c of location.closures) {
    const first = c.startsOn.toISOString().slice(0, 10);
    const last = c.endsOn.toISOString().slice(0, 10);
    for (let d = first < fromDate ? fromDate : first; d <= last && d <= toDate; d = addDays(d, 1)) closedDates.add(d);
  }
  if (location.observesPublicHolidays) {
    const holidays = await client.holiday.findMany({
      where: {
        countryCode: location.organization.countryCode,
        regionId: null,
        isPublic: true,
        date: { gte: new Date(`${fromDate}T00:00:00Z`), lte: new Date(`${toDate}T00:00:00Z`) },
      },
      select: { date: true },
    });
    for (const h of holidays) closedDates.add(h.date.toISOString().slice(0, 10));
  }

  const exceptions = await db().availabilityException.findMany({
    where: { practiceId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
    select: { startsAt: true, endsAt: true },
  });

  const active = { in: [...ACTIVE_STATUSES] };
  const exclude = options.excludeAppointmentId ? { NOT: { id: options.excludeAppointmentId } } : {};
  const [dentistBusy, chairBusy] = await Promise.all([
    client.appointment.findMany({
      where: {
        dentistProfileId: practice.dentistProfileId,
        status: active,
        startsAt: { lt: rangeEnd },
        occupiedUntil: { gt: rangeStart },
        ...exclude,
      },
      select: { startsAt: true, occupiedUntil: true },
    }),
    client.appointment.findMany({
      where: {
        locationId: location.id,
        usesChair: true,
        status: active,
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...exclude,
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return {
    practiceId,
    timezone,
    blockedReason,
    clinicHours,
    dentistRules:
      practice.availabilityRules.length > 0
        ? practice.availabilityRules.map((r) => ({ dayOfWeek: r.dayOfWeek, start: r.startMinutes, end: r.endMinutes, types: r.appointmentTypes }))
        : null,
    closedDates,
    exceptions: exceptions.map((e) => ({ start: e.startsAt, end: e.endsAt })),
    dentistBusy: dentistBusy.map((a) => ({ start: a.startsAt, end: a.occupiedUntil })),
    chairBusy: chairBusy.map((a) => ({ start: a.startsAt, end: a.endsAt })),
    chairs: Math.max(1, location.chairs),
    slotMinutes: practice.slotMinutes,
    bufferMinutes: practice.bufferMinutes,
    minNoticeMinutes: practice.minNoticeMinutes,
    maxAdvanceDays: practice.maxAdvanceDays,
    accepts: {
      video: practice.acceptsVideo,
      homeVisit: practice.acceptsHomeVisit && location.homeVisitRadiusKm !== null,
      emergency: practice.acceptsEmergency,
    },
  };
}

/** The service's duration and allowed types at this practice, or the consultation default. */
export async function resolveService(practiceId: string, serviceOfferingId: string | null | undefined) {
  const practice = await db().dentistPractice.findUnique({ where: { id: practiceId }, select: { locationId: true, dentistProfileId: true, slotMinutes: true } });
  if (!practice) throw errors.notFound('Practice');
  if (!serviceOfferingId) {
    return { offering: null, durationMinutes: practice.slotMinutes, types: [] as string[], name: 'Consultation' };
  }
  const offering = await db().serviceOffering.findFirst({
    where: {
      id: serviceOfferingId,
      locationId: practice.locationId,
      isActive: true,
      OR: [{ dentistProfileId: null }, { dentistProfileId: practice.dentistProfileId }],
    },
  });
  if (!offering) throw errors.validation('That service is not offered by this dentist at this branch.', { field: 'serviceOfferingId' });
  return {
    offering,
    durationMinutes: offering.durationMinutes ?? practice.slotMinutes,
    types: offering.appointmentTypes,
    name: offering.name,
  };
}

export interface AvailabilityQuery {
  readonly practiceId: string;
  readonly serviceOfferingId?: string | null;
  readonly type: SlotAppointmentType;
  readonly emergency?: boolean;
  readonly fromDate: string;
  readonly toDate: string;
  readonly now?: Date;
}

const MAX_RANGE_DAYS = 62;

function assertRange(fromDate: string, toDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    throw errors.validation('Dates must look like 2026-10-02.');
  }
  if (toDate < fromDate) throw errors.validation('The end date is before the start date.', { field: 'to' });
  const days = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / DAY;
  if (days > MAX_RANGE_DAYS) throw errors.validation(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`, { field: 'to' });
}

/** Bookable slots, straight from the database. */
export async function availableSlots(query: AvailabilityQuery): Promise<{ slots: Slot[]; timezone: string; reason: string | null }> {
  assertRange(query.fromDate, query.toDate);
  const service = await resolveService(query.practiceId, query.serviceOfferingId);
  const context = await loadAvailabilityContext(query.practiceId, query.fromDate, query.toDate);
  const request: SlotRequest = {
    type: query.type,
    durationMinutes: service.durationMinutes,
    serviceTypes: service.types,
    emergency: query.emergency,
    fromDate: query.fromDate,
    toDate: query.toDate,
    now: query.now ?? new Date(),
  };
  const reason = context.blockedReason ?? typeIneligibility(context, request);
  return { slots: generateSlots(context, request), timezone: context.timezone, reason };
}

/** Local dates in the range with at least one bookable slot. */
export async function availableDates(query: AvailabilityQuery): Promise<{ dates: Array<{ date: string; slots: number }>; timezone: string; reason: string | null }> {
  const { slots, timezone, reason } = await availableSlots(query);
  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.localDate, (counts.get(s.localDate) ?? 0) + 1);
  return { dates: [...counts.entries()].map(([date, n]) => ({ date, slots: n })), timezone, reason };
}

/** The earliest bookable slot within the booking window, for search results. */
export async function nextAvailableSlot(practiceId: string, type: SlotAppointmentType = 'CLINIC', now: Date = new Date()): Promise<Slot | null> {
  const practice = await db().dentistPractice.findUnique({
    where: { id: practiceId },
    select: { maxAdvanceDays: true, location: { select: { timezone: true } } },
  });
  if (!practice) return null;
  const today = localDateOf(now, practice.location.timezone);
  const horizon = Math.min(practice.maxAdvanceDays, 30);
  for (let offset = 0; offset <= horizon; offset += 7) {
    const fromDate = addDays(today, offset);
    const toDate = addDays(today, Math.min(offset + 6, horizon));
    const { slots } = await availableSlots({ practiceId, type, fromDate, toDate, now });
    if (slots.length > 0) return slots[0]!;
  }
  return null;
}

export function timeOfDayOf(localTime: string): 'MORNING' | 'AFTERNOON' | 'EVENING' {
  const hour = Number(localTime.slice(0, 2));
  return hour < 12 ? 'MORNING' : hour < 17 ? 'AFTERNOON' : 'EVENING';
}
