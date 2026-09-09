/**
 * Bulk price operations (specification §16).
 */

import { describe, expect, it } from 'vitest';
import {
  basisPointsFromPercent,
  planCopy,
  planPercentageChange,
  type BulkTargetRow,
} from '@/platform/pricing/bulk';

const r = (rupees: number) => BigInt(rupees) * 100n;

const row = (id: string, overrides: Partial<BulkTargetRow> = {}): BulkTargetRow => ({
  id,
  label: id,
  currency: 'INR',
  actualMinor: r(10000),
  discountedMinor: null,
  isCustomQuote: false,
  ...overrides,
});

describe('planPercentageChange', () => {
  it('raises prices by the given percentage', () => {
    const plan = planPercentageChange([row('a')], { basisPoints: 1000 });
    expect(plan.changes[0]?.newMinor).toBe(r(11000));
  });

  it('lowers prices for a negative percentage', () => {
    const plan = planPercentageChange([row('a')], { basisPoints: -1000 });
    expect(plan.changes[0]?.newMinor).toBe(r(9000));
  });

  it('produces the confirmation line the specification asks for', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(`s${i}`));
    expect(planPercentageChange(rows, { basisPoints: 1000 }).summary).toBe(
      '24 prices will increase by 10%.',
    );
  });

  it('changes nothing on its own — it only describes the change', () => {
    const original = row('a');
    planPercentageChange([original], { basisPoints: 5000 });
    expect(original.actualMinor).toBe(r(10000));
  });

  it('skips custom-quote rows and says why', () => {
    const plan = planPercentageChange([row('a', { isCustomQuote: true, actualMinor: null })], {
      basisPoints: 1000,
    });
    expect(plan.changes).toHaveLength(0);
    expect(plan.skipped[0]?.reason).toContain('custom quote');
  });

  it('skips rows that have no price yet and says why', () => {
    const plan = planPercentageChange([row('a', { actualMinor: null })], { basisPoints: 1000 });
    expect(plan.skipped[0]?.reason).toContain('No price is set');
  });

  it('updates the discounted price too, unless told not to', () => {
    const target = row('a', { discountedMinor: r(9000) });
    expect(planPercentageChange([target], { basisPoints: 1000 }).changes).toHaveLength(2);
    expect(
      planPercentageChange([target], { basisPoints: 1000, includeDiscounted: false }).changes,
    ).toHaveLength(1);
  });

  it('rounds rather than truncating, and never below zero', () => {
    // 10% of ₹12,345 is ₹1,234.50 — half a paisa cannot be stored.
    // 10% of ₹12,345.00 is ₹1,234.50 exactly — half a paisa cannot be stored,
    // and half_up sends it away from zero rather than quietly shaving it off.
    const plan = planPercentageChange([row('a', { actualMinor: r(12345) })], { basisPoints: 1000 });
    expect(plan.changes[0]?.newMinor).toBe(1_357_950n);
  });

  it('refuses a reduction that would zero every price', () => {
    expect(() => planPercentageChange([row('a')], { basisPoints: -10_000 })).toThrow(/zero or below/);
  });

  it('refuses fractional basis points', () => {
    expect(() => planPercentageChange([row('a')], { basisPoints: 12.5 })).toThrow(/whole number/);
  });

  it('counts a row once even when two of its fields change', () => {
    const plan = planPercentageChange([row('a', { discountedMinor: r(9000) })], { basisPoints: 1000 });
    expect(plan.changes).toHaveLength(2);
    expect(plan.summary).toBe('1 price will increase by 10%.');
  });
});

describe('basisPointsFromPercent', () => {
  it('converts a percentage a human typed', () => {
    expect(basisPointsFromPercent(10)).toBe(1000);
    expect(basisPointsFromPercent(-7.5)).toBe(-750);
    expect(basisPointsFromPercent(0.01)).toBe(1);
  });

  it('refuses a rate finer than it can represent, rather than rounding silently', () => {
    expect(() => basisPointsFromPercent(7.125)).toThrow(/finer than/);
  });
});

describe('planCopy', () => {
  it('separates rows that would be added from rows that would be overwritten', () => {
    const source = [row('a', { label: 'Crown' }), row('b', { label: 'RCT' })];
    const destination = [row('c', { label: 'Crown' })];
    const plan = planCopy(source, destination);
    expect(plan.created).toEqual(['RCT']);
    expect(plan.overwritten).toEqual(['Crown']);
    expect(plan.summary).toBe('1 added, 1 overwritten.');
  });
});
