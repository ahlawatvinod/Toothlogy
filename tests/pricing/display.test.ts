/**
 * Price display rules (specification §26).
 *
 * These are the rules that decide what a patient reads. They are tested
 * exhaustively and without a database because every one of them is a claim
 * made to a patient about money, and getting one wrong is not a cosmetic bug.
 */

import { describe, expect, it } from 'vitest';
import { describePrice, describeSuggestedRange, effectiveAmount } from '@/platform/pricing/display';

const INR = 'INR';
/** Rupees to paise, so the tests read in the units the spec is written in. */
const r = (rupees: number) => BigInt(rupees) * 100n;

describe('describePrice — the precedence ladder', () => {
  it('renders a firm price with its unit', () => {
    const result = describePrice({ actualMinor: r(12000), currency: INR, unitLabel: '/tooth' });
    expect(result.kind).toBe('exact');
    expect(result.primary).toBe('₹12,000.00');
    expect(result.text).toBe('₹12,000.00 /tooth');
  });

  it('renders a min-and-max pair as a range', () => {
    const result = describePrice({ minMinor: r(12000), maxMinor: r(18000), currency: INR });
    expect(result.kind).toBe('range');
    expect(result.primary).toBe('₹12,000.00');
    expect(result.rangeEnd).toBe('₹18,000.00');
  });

  it('renders a minimum alone as "Starting from"', () => {
    const result = describePrice({ minMinor: r(12000), currency: INR });
    expect(result.kind).toBe('from');
    expect(result.text).toContain('Starting from ₹12,000.00');
  });

  it('renders a maximum alone as "Up to"', () => {
    const result = describePrice({ maxMinor: r(9000), currency: INR });
    expect(result.kind).toBe('up_to');
    expect(result.text).toContain('Up to ₹9,000.00');
  });

  it('shows a discount with the regular price struck through', () => {
    const result = describePrice({
      actualMinor: r(12000),
      discountedMinor: r(10999),
      currency: INR,
    });
    expect(result.kind).toBe('discounted');
    expect(result.primary).toBe('₹10,999.00');
    expect(result.strikethrough).toBe('₹12,000.00');
  });

  it('falls back to "Contact clinic" when nothing is set', () => {
    expect(describePrice({ currency: INR }).kind).toBe('on_request');
  });
});

describe('describePrice — the rules that stop a misleading claim', () => {
  it('custom quote outranks every stored figure', () => {
    // A stale minimum left on a row must never be shown as the price.
    const result = describePrice({
      isCustomQuote: true,
      minMinor: r(50000),
      actualMinor: r(60000),
      currency: INR,
    });
    expect(result.kind).toBe('custom_quote');
    expect(result.primary).toBeNull();
    expect(result.text).toBe('Custom quote');
  });

  it('does not invent a saving when there is no regular price to discount from', () => {
    const result = describePrice({ discountedMinor: r(10999), currency: INR });
    expect(result.kind).toBe('discounted');
    expect(result.strikethrough).toBeNull();
  });

  it('does not strike through a "regular" price that is below the discount', () => {
    // Otherwise the UI shows ₹12,000 struck out beside a higher ₹13,000.
    const result = describePrice({
      actualMinor: r(10000),
      discountedMinor: r(11000),
      currency: INR,
    });
    expect(result.strikethrough).toBeNull();
  });

  it('collapses a range whose ends are equal into a single price', () => {
    const result = describePrice({ minMinor: r(5000), maxMinor: r(5000), currency: INR });
    expect(result.kind).toBe('exact');
    expect(result.text).not.toContain('–');
  });

  it('appends the "+" for an open-ended range and never for a firm price', () => {
    const open = describePrice({
      minMinor: r(10000),
      maxMinor: r(40000),
      openEnded: true,
      currency: INR,
    });
    expect(open.text).toContain('+');

    const firm = describePrice({ actualMinor: r(10000), openEnded: true, currency: INR });
    expect(firm.text).not.toContain('+');
  });

  it('treats zero as a real price rather than as absent', () => {
    // A free consultation is a real offer. The falsy-zero bug would turn it
    // into "Contact clinic".
    const result = describePrice({ actualMinor: 0n, currency: INR });
    expect(result.kind).toBe('exact');
    expect(result.primary).toBe('₹0.00');
  });

  it('uses Indian digit grouping', () => {
    const result = describePrice({ actualMinor: r(150000), currency: INR });
    expect(result.primary).toBe('₹1,50,000.00');
  });
});

describe('describeSuggestedRange', () => {
  it('always labels the range so it cannot be read as a clinic price', () => {
    const result = describeSuggestedRange({
      minMinor: r(8000),
      maxMinor: r(18000),
      currency: INR,
    });
    expect(result?.label).toBe('Suggested range');
    expect(result?.value).toContain('₹8,000.00');
  });

  it('returns null rather than a meaningless row when there is no range', () => {
    expect(describeSuggestedRange({ currency: INR })).toBeNull();
  });
});

describe('effectiveAmount', () => {
  it('prefers the discounted price for sorting', () => {
    const value = effectiveAmount({
      actualMinor: r(12000),
      discountedMinor: r(10999),
      currency: INR,
    });
    expect(value?.amountMinor).toBe(r(10999));
  });

  it('has no amount for a custom quote', () => {
    expect(effectiveAmount({ actualMinor: r(1), isCustomQuote: true, currency: INR })).toBeNull();
  });
});
