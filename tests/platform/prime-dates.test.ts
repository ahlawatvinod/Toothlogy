/** TL-TEST-PRIME-DATES-001 — membership periods add calendar months, clamped to the month's last day. */

import { describe, expect, it } from 'vitest';
import { addMonths } from '@/platform/prime/service';

describe('addMonths', () => {
  it('keeps the day of the month where it exists', () => {
    expect(addMonths(new Date('2026-09-11T10:00:00Z'), 12).toISOString()).toBe('2027-09-11T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z');
  });

  it('clamps to the last day of a shorter month, leap years included', () => {
    expect(addMonths(new Date('2027-01-31T00:00:00Z'), 1).toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(new Date('2026-08-31T00:00:00Z'), 1).toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });
});
