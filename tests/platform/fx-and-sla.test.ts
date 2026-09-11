/**
 * TL-TEST-FX-SLA-001 — exact exchange-rate arithmetic and service-level outcomes.
 */

import { describe, expect, it } from 'vitest';
import { convertMinor, parseRate, rateText } from '@/platform/globalization/exchange-rates';
import { slaOutcome } from '@/platform/enterprise/service';

const B = (n: number) => BigInt(n);

describe('exchange rates', () => {
  it('parses and prints rates exactly, up to six decimal places', () => {
    expect(parseRate('83.25')).toBe(B(83_250_000));
    expect(parseRate('0.012012')).toBe(B(12_012));
    expect(parseRate('1')).toBe(B(1_000_000));
    expect(parseRate('0')).toBeNull();
    expect(parseRate('1.1234567')).toBeNull();
    expect(parseRate('-2')).toBeNull();
    expect(parseRate('1e3')).toBeNull();
    expect(rateText(B(83_250_000))).toBe('83.25');
    expect(rateText(B(1_000_000))).toBe('1');
  });

  it('converts between currencies with different minor units, rounding half away from zero', () => {
    expect(convertMinor(B(1_000), B(83_250_000), 2, 2)).toBe(B(83_250)); // $10.00 → ₹832.50
    expect(convertMinor(B(1), B(83_250_000), 2, 2)).toBe(B(83)); // $0.01 → ₹0.8325 → ₹0.83
    expect(convertMinor(B(100), B(1_500_000), 0, 2)).toBe(B(15_000)); // ¥100 at 1.5 → 150.00
    expect(convertMinor(B(15_000), B(666_667), 2, 0)).toBe(B(100)); // 150.00 → ¥100
    expect(convertMinor(B(-1_000), B(83_250_000), 2, 2)).toBe(B(-83_250));
  });
});

describe('service-level outcomes', () => {
  const due = new Date('2026-09-11T12:00:00Z');
  it('is met on time, breached late or unanswered after the deadline, and running before it', () => {
    expect(slaOutcome(due, new Date('2026-09-11T11:59:00Z'), new Date('2026-09-12T00:00:00Z'))).toBe('MET');
    expect(slaOutcome(due, due, due)).toBe('MET');
    expect(slaOutcome(due, new Date('2026-09-11T12:01:00Z'), new Date('2026-09-11T12:01:00Z'))).toBe('BREACHED');
    expect(slaOutcome(due, null, new Date('2026-09-11T12:00:01Z'))).toBe('BREACHED');
    expect(slaOutcome(due, null, new Date('2026-09-11T11:00:00Z'))).toBe('RUNNING');
  });
});
