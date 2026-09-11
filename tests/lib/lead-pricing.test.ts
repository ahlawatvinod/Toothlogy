/**
 * TL-TEST-LEAD-PRICING-001 — pure pricing, tier and reminder rules.
 *
 * The integration suite proves these against the database; here each rule is
 * pinned at its exact boundaries without one.
 */

import { describe, expect, it } from 'vitest';
import { billingDecision, netOfGross, taxOnNet } from '@/platform/billing/service';
import { reminderKindFor } from '@/platform/appointments/service';
import { evaluate, qualificationCriteriaSchema } from '@/platform/leads/qualification';

describe('lead pricing arithmetic (minor units)', () => {
  it('₹50 + 18% GST is ₹59: 5000 + 900 = 5900 paise', () => {
    expect(taxOnNet(BigInt(5000), 1800)).toBe(BigInt(900));
    expect(BigInt(5000) + taxOnNet(BigInt(5000), 1800)).toBe(BigInt(5900));
  });

  it('keeps GST separate from the base price when reading a tax-inclusive amount', () => {
    expect(netOfGross(BigInt(5900), 1800)).toBe(BigInt(5000));
    expect(netOfGross(BigInt(118_000), 1800)).toBe(BigInt(100_000)); // the minimum recharge
  });

  it('rounds tax half up to the paisa, never to a float', () => {
    expect(taxOnNet(BigInt(1), 1800)).toBe(BigInt(0)); // 0.18 paise
    expect(taxOnNet(BigInt(3), 1800)).toBe(BigInt(1)); // 0.54 paise
    expect(typeof taxOnNet(BigInt(5000), 1800)).toBe('bigint');
  });
});

describe('free allowance boundary: first 30 qualified leads free', () => {
  it.each([
    [1, 'FREE'],
    [29, 'FREE'],
    [30, 'FREE'],
    [31, 'PAYABLE'],
    [32, 'PAYABLE'],
  ] as const)('lead %i is %s', (ordinal, expected) => {
    expect(billingDecision(ordinal, 30)).toBe(expected);
  });

  it('charges from the first lead when the allowance is zero, and refuses a nonsense ordinal', () => {
    expect(billingDecision(1, 0)).toBe('PAYABLE');
    expect(() => billingDecision(0, 30)).toThrow(RangeError);
    expect(() => billingDecision(1.5, 30)).toThrow(RangeError);
  });
});

describe('reminder windows, in the branch timezone', () => {
  const IST = 'Asia/Kolkata';
  // 2026-09-15 11:00 IST = 05:30Z.
  const start = new Date('2026-09-15T05:30:00Z');
  const at = (iso: string) => new Date(iso);

  it('tomorrow: within 24 hours, on an earlier local date', () => {
    expect(reminderKindFor(start, at('2026-09-14T09:30:00Z'), IST)).toBe('DAY_BEFORE'); // 15:00 IST the day before
    expect(reminderKindFor(start, at('2026-09-14T05:00:00Z'), IST)).toBeNull(); // more than 24 hours ahead
  });

  it('today: from 07:00 local on the day, more than two hours ahead', () => {
    expect(reminderKindFor(start, at('2026-09-15T01:00:00Z'), IST)).toBeNull(); // 06:30 IST: too early to message
    expect(reminderKindFor(start, at('2026-09-15T02:30:00Z'), IST)).toBe('TODAY'); // 08:00 IST
  });

  it('soon: within two hours; nothing once it has started', () => {
    expect(reminderKindFor(start, at('2026-09-15T04:30:00Z'), IST)).toBe('SOON');
    expect(reminderKindFor(start, start, IST)).toBeNull();
  });

  it('decides "today" by the branch’s date, not UTC’s', () => {
    // 00:30 IST on the 15th is still the 14th in UTC; in IST it is the same day.
    const early = new Date('2026-09-14T19:00:00Z'); // 00:30 IST, the 15th
    const evening = new Date('2026-09-15T13:30:00Z'); // 19:00 IST, the 15th
    expect(reminderKindFor(evening, early, IST)).toBeNull(); // same local day, before 07:00
    expect(reminderKindFor(evening, new Date('2026-09-15T02:00:00Z'), IST)).toBe('TODAY'); // 07:30 IST
    // The same instants in New York fall on different local dates.
    expect(reminderKindFor(evening, new Date('2026-09-14T19:00:00Z'), 'America/New_York')).toBe('DAY_BEFORE');
  });
});

describe('qualification: internal and test leads are never billable', () => {
  const criteria = qualificationCriteriaSchema.parse({ testEmailDomains: ['qa.toothlogy.test'] });
  const base = { source: 'CALLBACK_REQUEST' as const, patientContactVerified: true, earlierDuplicateId: null, patientIsPracticeMember: false };

  it('qualifies an ordinary verified callback', () => {
    expect(evaluate(criteria, base).decision).toBe('QUALIFIED');
  });

  it('refuses staff (internal) and configured test domains', () => {
    expect(evaluate(criteria, { ...base, patientIsStaff: true })).toMatchObject({ decision: 'NOT_QUALIFIED', reason: expect.stringMatching(/Internal/) });
    expect(evaluate(criteria, { ...base, patientEmail: 'tester@QA.toothlogy.test' })).toMatchObject({ decision: 'NOT_QUALIFIED', reason: expect.stringMatching(/Test lead/) });
    expect(evaluate(criteria, { ...base, patientEmail: 'someone@example.com' }).decision).toBe('QUALIFIED');
  });

  it('defaults to no test domains', () => {
    expect(qualificationCriteriaSchema.parse({}).testEmailDomains).toEqual([]);
  });
});
