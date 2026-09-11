/**
 * The availability engine's rules, without a database.
 *
 * Every test builds a context by hand and asks `generateSlots` for slots, so
 * each rule — split shifts, closures, leave, buffers, chairs, notice, the
 * booking window, appointment types, timezones — is checked on its own.
 * Monday 5 October 2026 in Asia/Kolkata (UTC+5:30) is the working day.
 */

import { describe, expect, it } from 'vitest';
import { generateSlots, zonedToUtc, type AvailabilityContext, type SlotRequest } from '@/platform/appointments/availability';

const MONDAY = '2026-10-05';
const SUNDAY_EVENING_UTC = new Date('2026-10-04T12:00:00Z'); // well before Monday

function context(overrides: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return {
    practiceId: 'prc_test',
    timezone: 'Asia/Kolkata',
    blockedReason: null,
    // Split shift: 09:00–13:00 and 17:00–21:00 on Mondays.
    clinicHours: new Map([[1, [{ start: 540, end: 780 }, { start: 1020, end: 1260 }]]]),
    dentistRules: null,
    closedDates: new Set(),
    exceptions: [],
    dentistBusy: [],
    chairBusy: [],
    chairs: 1,
    slotMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 120,
    maxAdvanceDays: 60,
    accepts: { video: false, homeVisit: false, emergency: false },
    ...overrides,
  };
}

function request(overrides: Partial<SlotRequest> = {}): SlotRequest {
  return { type: 'CLINIC', durationMinutes: 30, fromDate: MONDAY, toDate: MONDAY, now: SUNDAY_EVENING_UTC, ...overrides };
}

const times = (slots: ReturnType<typeof generateSlots>) => slots.map((s) => s.localTime);
const local = (hhmm: string) => zonedToUtc(MONDAY, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), 'Asia/Kolkata');

describe('availability engine', () => {
  it('follows split-shift working hours, with the gap as the break', () => {
    const slots = times(generateSlots(context(), request()));
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe('09:00');
    expect(slots).toContain('12:30');
    expect(slots).not.toContain('13:00');
    expect(slots).not.toContain('15:00');
    expect(slots).toContain('17:00');
    expect(slots.at(-1)).toBe('20:30');
  });

  it('converts local wall-clock time to the right instant', () => {
    const [first] = generateSlots(context(), request());
    expect(first?.startsAt).toBe('2026-10-05T03:30:00.000Z'); // 09:00 IST
  });

  it('offers nothing on a closure or observed holiday', () => {
    expect(generateSlots(context({ closedDates: new Set([MONDAY]) }), request())).toEqual([]);
  });

  it('confines clinic visits to the dentist’s sessions within clinic hours', () => {
    const slots = times(generateSlots(context({ dentistRules: [{ dayOfWeek: 1, start: 480, end: 660, types: [] }] }), request()));
    expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30']);
  });

  it('lets video follow the dentist’s own session, outside clinic hours', () => {
    const ctx = context({
      accepts: { video: true, homeVisit: false, emergency: false },
      dentistRules: [{ dayOfWeek: 1, start: 1260, end: 1380, types: ['VIDEO'] }],
    });
    expect(times(generateSlots(ctx, request({ type: 'VIDEO' })))).toEqual(['21:00', '21:30', '22:00', '22:30']);
    // That session takes video only: no clinic visits come from it.
    expect(generateSlots(ctx, request({ type: 'CLINIC' }))).toEqual([]);
  });

  it('removes leave and blocked time', () => {
    const slots = times(generateSlots(context({ exceptions: [{ start: local('09:00'), end: local('10:00') }] }), request()));
    expect(slots).not.toContain('09:00');
    expect(slots).not.toContain('09:30');
    expect(slots[0]).toBe('10:00');
  });

  it('never overlaps an existing appointment, including the buffer after a slot', () => {
    const busy = [{ start: local('10:00'), end: local('10:30') }];
    expect(times(generateSlots(context({ dentistBusy: busy }), request()))).not.toContain('10:00');
    // With a 15-minute buffer, 09:30 would run into 10:00 and is dropped too.
    const withBuffer = times(generateSlots(context({ dentistBusy: busy, bufferMinutes: 15 }), request()));
    expect(withBuffer).not.toContain('09:30');
    expect(withBuffer).toContain('09:00');
  });

  it('respects chair capacity across dentists for clinic visits only', () => {
    const chairBusy = [{ start: local('11:00'), end: local('11:30') }];
    expect(times(generateSlots(context({ chairBusy }), request()))).not.toContain('11:00');
    expect(times(generateSlots(context({ chairBusy, chairs: 2 }), request()))).toContain('11:00');
    const video = context({ chairBusy, accepts: { video: true, homeVisit: false, emergency: false } });
    expect(times(generateSlots(video, request({ type: 'VIDEO' })))).toContain('11:00');
  });

  it('honours the minimum notice, which emergencies skip', () => {
    const now = new Date('2026-10-05T03:00:00Z'); // 08:30 IST
    expect(times(generateSlots(context(), request({ now })))[0]).toBe('10:30');
    const emergency = context({ accepts: { video: false, homeVisit: false, emergency: true } });
    expect(times(generateSlots(emergency, request({ now, emergency: true })))[0]).toBe('09:00');
  });

  it('never returns a slot in the past', () => {
    const now = new Date('2026-10-05T06:00:00Z'); // 11:30 IST
    const slots = generateSlots(context({ minNoticeMinutes: 0 }), request({ now }));
    expect(slots.every((s) => Date.parse(s.startsAt) >= now.getTime())).toBe(true);
    expect(times(slots)[0]).toBe('11:30');
  });

  it('stops at the booking window', () => {
    const slots = generateSlots(context({ maxAdvanceDays: 1 }), request({ fromDate: MONDAY, toDate: '2026-10-19' }));
    expect(new Set(slots.map((s) => s.localDate))).toEqual(new Set([MONDAY]));
  });

  it('refuses types the practice or the service does not allow', () => {
    expect(generateSlots(context(), request({ type: 'HOME_VISIT' }))).toEqual([]);
    expect(generateSlots(context(), request({ type: 'VIDEO' }))).toEqual([]);
    const video = context({ accepts: { video: true, homeVisit: false, emergency: false } });
    expect(generateSlots(video, request({ type: 'VIDEO', serviceTypes: ['CLINIC'] }))).toEqual([]);
    expect(generateSlots(context(), request({ emergency: true }))).toEqual([]);
  });

  it('offers nothing while the practice is blocked', () => {
    expect(generateSlots(context({ blockedReason: 'Paused' }), request())).toEqual([]);
  });

  it('fits the service duration inside the window', () => {
    const slots = times(generateSlots(context(), request({ durationMinutes: 90 })));
    expect(slots).toContain('11:30'); // 11:30–13:00 fits
    expect(slots).not.toContain('12:00'); // 12:00–13:30 would not
  });

  it('is deterministic', () => {
    expect(generateSlots(context(), request())).toEqual(generateSlots(context(), request()));
  });

  it('handles a daylight-saving change', () => {
    // New York leaves daylight time on 1 November 2026.
    expect(zonedToUtc('2026-10-25', 540, 'America/New_York').toISOString()).toBe('2026-10-25T13:00:00.000Z');
    expect(zonedToUtc('2026-11-01', 540, 'America/New_York').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
});
