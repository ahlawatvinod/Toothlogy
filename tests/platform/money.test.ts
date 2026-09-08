/**
 * TL-TEST-MONEY-001 — Money arithmetic
 *
 * Money is the part of the foundation where a subtle bug becomes a financial
 * discrepancy rather than a visual glitch, so these tests target the specific
 * mistakes that cause real-world losses: float drift, zero-decimal currencies,
 * silent currency mixing, and remainders lost in division.
 */

import { describe, expect, it } from 'vitest';
import {
  add,
  allocate,
  allocateByRatio,
  compare,
  deserializeMoney,
  formatMoney,
  fromDecimal,
  money,
  multiply,
  percentageOf,
  serializeMoney,
  subtract,
  sum,
  toDecimal,
  zero,
} from '@/platform/money';

describe('money construction', () => {
  it('round-trips a decimal string without loss', () => {
    const value = fromDecimal('123.45', 'INR');
    expect(value.amountMinor).toBe(12345n);
    expect(toDecimal(value)).toBe('123.45');
  });

  it('handles zero-decimal currencies', () => {
    // JPY has no minor unit. Code assuming "cents are always 1/100" turns
    // 1000 yen into 10 yen.
    const yen = fromDecimal('1000', 'JPY');
    expect(yen.amountMinor).toBe(1000n);
    expect(toDecimal(yen)).toBe('1000');
  });

  it('pads a short fraction to the currency exponent', () => {
    expect(fromDecimal('5.4', 'INR').amountMinor).toBe(540n);
    expect(fromDecimal('5', 'INR').amountMinor).toBe(500n);
  });

  it('rejects more decimals than the currency supports', () => {
    // Accepting '10.999' for INR would force a silent rounding decision.
    expect(() => fromDecimal('10.999', 'INR')).toThrow(/decimal place/i);
    expect(() => fromDecimal('10.5', 'JPY')).toThrow(/decimal place/i);
  });

  it('rejects malformed amounts and unknown currencies', () => {
    expect(() => fromDecimal('abc', 'INR')).toThrow(/not a valid amount/i);
    expect(() => fromDecimal('1.2.3', 'INR')).toThrow(/not a valid amount/i);
    expect(() => money(100n, 'XYZ')).toThrow(/unknown currency/i);
  });

  it('rejects fractional minor units', () => {
    expect(() => money(10.5, 'INR')).toThrow(/integers/i);
  });

  it('handles negative amounts', () => {
    const refund = fromDecimal('-49.99', 'INR');
    expect(refund.amountMinor).toBe(-4999n);
    expect(toDecimal(refund)).toBe('-49.99');
  });
});

describe('money arithmetic', () => {
  it('adds without float error', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754. Integer minor units make
    // this exact, which is the entire reason for the representation.
    const total = add(fromDecimal('0.10', 'INR'), fromDecimal('0.20', 'INR'));
    expect(toDecimal(total)).toBe('0.30');
  });

  it('sums a long list exactly', () => {
    const items = Array.from({ length: 1000 }, () => fromDecimal('0.01', 'INR'));
    expect(toDecimal(sum(items, 'INR'))).toBe('10.00');
  });

  it('refuses to mix currencies', () => {
    // An implicit conversion would need a rate, a timestamp and a source —
    // decisions that belong to the caller, never to an arithmetic helper.
    expect(() => add(fromDecimal('10', 'INR'), fromDecimal('10', 'USD'))).toThrow(
      /cannot combine/i,
    );
    expect(() => compare(fromDecimal('1', 'INR'), fromDecimal('1', 'USD'))).toThrow();
  });

  it('subtracts and multiplies by quantity', () => {
    expect(toDecimal(subtract(fromDecimal('100', 'INR'), fromDecimal('35.50', 'INR')))).toBe(
      '64.50',
    );
    expect(toDecimal(multiply(fromDecimal('19.99', 'INR'), 3))).toBe('59.97');
  });

  it('rejects fractional multipliers', () => {
    expect(() => multiply(fromDecimal('10', 'INR'), 1.5)).toThrow(/percentageOf/);
  });

  it('handles amounts beyond Number.MAX_SAFE_INTEGER', () => {
    // ~90 trillion rupees in paise exceeds 2^53. With `number` this would round
    // silently; bigint stays exact.
    const huge = money(9_007_199_254_740_993n, 'INR');
    expect(add(huge, money(1n, 'INR')).amountMinor).toBe(9_007_199_254_740_994n);
  });
});

describe('percentages and tax', () => {
  it('computes GST at 18% in basis points', () => {
    const gst = percentageOf(fromDecimal('1000.00', 'INR'), 1800);
    expect(toDecimal(gst)).toBe('180.00');
  });

  it('uses banker\'s rounding by default', () => {
    // half_even avoids the upward bias that repeated half_up accumulates into
    // a real, one-directional discrepancy across many transactions.
    expect(toDecimal(percentageOf(money(250n, 'INR'), 5000))).toBe('1.25');
    // 5 paise at 50% is exactly 2.5 → rounds to the even neighbour, 2.
    expect(percentageOf(money(5n, 'INR'), 5000).amountMinor).toBe(2n);
    // 15 paise at 50% is exactly 7.5 → rounds to 8, the even neighbour.
    expect(percentageOf(money(15n, 'INR'), 5000).amountMinor).toBe(8n);
  });

  it('supports explicit rounding modes', () => {
    expect(percentageOf(money(5n, 'INR'), 5000, 'half_up').amountMinor).toBe(3n);
    expect(percentageOf(money(5n, 'INR'), 5000, 'floor').amountMinor).toBe(2n);
    expect(percentageOf(money(5n, 'INR'), 5000, 'ceil').amountMinor).toBe(3n);
  });

  it('rejects fractional basis points', () => {
    expect(() => percentageOf(fromDecimal('10', 'INR'), 18.5)).toThrow(/integer/i);
  });
});

describe('allocation', () => {
  it('splits without losing a minor unit', () => {
    // The classic bug: ₹10.00 / 3 = ₹3.33 each, and one paisa disappears.
    const parts = allocate(fromDecimal('10.00', 'INR'), 3);
    expect(parts.map(toDecimal)).toEqual(['3.34', '3.33', '3.33']);
    expect(toDecimal(sum(parts, 'INR'))).toBe('10.00');
  });

  it('splits evenly when it divides exactly', () => {
    const parts = allocate(fromDecimal('9.00', 'INR'), 3);
    expect(parts.map(toDecimal)).toEqual(['3.00', '3.00', '3.00']);
  });

  it('allocates negative amounts without losing a unit', () => {
    const parts = allocate(fromDecimal('-10.00', 'INR'), 3);
    expect(toDecimal(sum(parts, 'INR'))).toBe('-10.00');
  });

  it('allocates by weight and still sums exactly', () => {
    const parts = allocateByRatio(fromDecimal('100.00', 'INR'), [1, 1, 1]);
    expect(toDecimal(sum(parts, 'INR'))).toBe('100.00');

    const uneven = allocateByRatio(fromDecimal('99.99', 'INR'), [70, 20, 10]);
    expect(toDecimal(sum(uneven, 'INR'))).toBe('99.99');
  });

  it('rejects invalid allocation inputs', () => {
    expect(() => allocate(fromDecimal('10', 'INR'), 0)).toThrow(/positive integer/i);
    expect(() => allocateByRatio(fromDecimal('10', 'INR'), [])).toThrow(/at least one/i);
    expect(() => allocateByRatio(fromDecimal('10', 'INR'), [0, 0])).toThrow(/sum to zero/i);
  });
});

describe('presentation and serialisation', () => {
  it('formats with the locale\'s own digit grouping', () => {
    // en-IN groups as 1,23,456.78 (lakhs); en-US as 123,456.78. Hand-rolled
    // formatting gets this wrong for exactly Toothlogy's launch market.
    const value = fromDecimal('123456.78', 'INR');
    expect(formatMoney(value, 'en-IN')).toContain('1,23,456.78');
    expect(formatMoney(value, 'en-US')).toContain('123,456.78');
  });

  it('round-trips through JSON-safe serialisation', () => {
    // bigint is not JSON-representable, so it crosses the wire as a string.
    const original = fromDecimal('1234.56', 'INR');
    const restored = deserializeMoney(serializeMoney(original));
    expect(restored).toEqual(original);
    expect(serializeMoney(original).amountMinor).toBe('123456');
  });

  it('treats zero consistently', () => {
    expect(toDecimal(zero('INR'))).toBe('0.00');
    expect(toDecimal(zero('JPY'))).toBe('0');
  });
});
