/**
 * Price validation (specification §17).
 */

import { describe, expect, it } from 'vitest';
import { validatePriceFields } from '@/platform/pricing/validation';

const INR = 'INR';
const r = (rupees: number) => BigInt(rupees) * 100n;
const base = { currency: INR, unitKey: 'per_tooth' } as const;

const fields = (issues: readonly { field: string }[]) => issues.map((issue) => issue.field);

describe('validatePriceFields', () => {
  it('accepts a well-formed row', () => {
    expect(
      validatePriceFields({ ...base, minMinor: r(8000), maxMinor: r(18000), actualMinor: r(12000) }),
    ).toEqual([]);
  });

  it('rejects a negative price', () => {
    expect(fields(validatePriceFields({ ...base, actualMinor: -1n }))).toContain('actualMinor');
  });

  it('rejects a maximum below the minimum', () => {
    expect(
      fields(validatePriceFields({ ...base, minMinor: r(9000), maxMinor: r(5000) })),
    ).toContain('maxMinor');
  });

  it('rejects a discount at or above the regular price', () => {
    expect(
      fields(validatePriceFields({ ...base, actualMinor: r(12000), discountedMinor: r(12000) })),
    ).toContain('discountedMinor');
    expect(
      fields(validatePriceFields({ ...base, actualMinor: r(12000), discountedMinor: r(13000) })),
    ).toContain('discountedMinor');
  });

  it('rejects a discount with nothing to discount from', () => {
    expect(fields(validatePriceFields({ ...base, discountedMinor: r(999) }))).toContain(
      'discountedMinor',
    );
  });

  it('rejects a firm price outside its own declared range', () => {
    expect(
      fields(
        validatePriceFields({ ...base, minMinor: r(8000), maxMinor: r(18000), actualMinor: r(500) }),
      ),
    ).toContain('actualMinor');
  });

  it('rejects a custom-quote row that also carries prices', () => {
    expect(
      fields(validatePriceFields({ ...base, isCustomQuote: true, actualMinor: r(1000) })),
    ).toContain('isCustomQuote');
  });

  it('accepts a custom-quote row with no prices and no unit', () => {
    expect(validatePriceFields({ currency: INR, isCustomQuote: true, unitKey: null })).toEqual([]);
  });

  it('requires a unit on a priced row', () => {
    // "₹12,000" means different things per tooth and per case.
    expect(
      fields(validatePriceFields({ currency: INR, actualMinor: r(12000), unitKey: null })),
    ).toContain('unitKey');
  });

  it('rejects an unsupported currency without trying to format it', () => {
    const issues = validatePriceFields({ ...base, currency: 'XYZ', actualMinor: r(100) });
    expect(fields(issues)).toEqual(['currency']);
  });

  it('flags an implausibly large amount, which is how a units mistake looks', () => {
    // ₹12,000 entered as if it were already paise, then multiplied again.
    expect(fields(validatePriceFields({ ...base, actualMinor: 120_000_000_00n }))).toContain(
      'actualMinor',
    );
  });

  it('reports every problem at once rather than only the first', () => {
    const issues = validatePriceFields({
      currency: INR,
      unitKey: null,
      minMinor: r(9000),
      maxMinor: r(5000),
      actualMinor: -5n,
    });
    expect(issues.length).toBeGreaterThan(2);
  });

  it('accepts zero as a price', () => {
    expect(validatePriceFields({ ...base, actualMinor: 0n })).toEqual([]);
  });
});
