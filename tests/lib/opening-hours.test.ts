/**
 * Opening-hours form conversion.
 *
 * The mistakes these catch are the ones that would otherwise publish a clinic
 * as open when it is shut: a closing time before the opening time, and two
 * sessions that overlap because someone typed 13:00 twice.
 */

import { describe, expect, it } from 'vitest';
import { copyDay, emptyWeek, fromRows, hhmmToMinutes, minutesToHHMM, toRows } from '@/lib/opening-hours';

describe('opening hours', () => {
  it('converts between HH:MM and minutes, including end of day', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('9:30')).toBe(570);
    expect(hhmmToMinutes('24:00', 'closes')).toBe(1440);
    // Midnight at the end is a closing time only.
    expect(hhmmToMinutes('24:00', 'opens')).toBeNull();
    expect(hhmmToMinutes('25:00')).toBeNull();
    expect(hhmmToMinutes('12:60')).toBeNull();
    expect(hhmmToMinutes('noon')).toBeNull();
    expect(minutesToHHMM(1260)).toBe('21:00');
  });

  it('round-trips split shifts', () => {
    const rows = [
      { dayOfWeek: 1, opensAtMinutes: 1020, closesAtMinutes: 1260 },
      { dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 780 },
    ];
    const week = fromRows(rows);
    expect(week[1]).toEqual([
      { opens: '09:00', closes: '13:00' },
      { opens: '17:00', closes: '21:00' },
    ]);
    const back = toRows(week);
    expect(back.errors).toEqual({});
    expect(back.rows).toEqual([
      { dayOfWeek: 1, opensAtMinutes: 540, closesAtMinutes: 780 },
      { dayOfWeek: 1, opensAtMinutes: 1020, closesAtMinutes: 1260 },
    ]);
  });

  it('names the day with a closing time before its opening time', () => {
    const week = emptyWeek();
    week[3] = [{ opens: '18:00', closes: '10:00' }];
    const result = toRows(week);
    expect(result.errors[3]).toMatch(/after opening/);
    expect(result.rows).toEqual([]);
  });

  it('finds overlapping sessions regardless of the order they were typed', () => {
    const week = emptyWeek();
    week[2] = [
      { opens: '12:00', closes: '15:00' },
      { opens: '09:00', closes: '13:00' },
    ];
    expect(toRows(week).errors[2]).toMatch(/overlap/);
  });

  it('allows back-to-back sessions that touch but do not overlap', () => {
    const week = emptyWeek();
    week[2] = [
      { opens: '09:00', closes: '13:00' },
      { opens: '13:00', closes: '14:00' },
    ];
    expect(toRows(week).errors).toEqual({});
  });

  it('reports more sessions than the server accepts', () => {
    const week = emptyWeek().map(() => [
      { opens: '08:00', closes: '09:00' },
      { opens: '10:00', closes: '11:00' },
      { opens: '12:00', closes: '13:00' },
      { opens: '14:00', closes: '15:00' },
    ]);
    expect(toRows(week).weekError).toMatch(/At most 21/);
  });

  it('copies one day onto others without sharing objects', () => {
    const week = emptyWeek();
    week[1] = [{ opens: '09:00', closes: '13:00' }];
    const copied = copyDay(week, 1, [2, 3]);
    expect(copied[2]).toEqual(week[1]);
    expect(copied[3]).toEqual(week[1]);
    expect(copied[0]).toEqual([]);
    expect(copied[2]![0]).not.toBe(week[1]![0]);
  });
});
