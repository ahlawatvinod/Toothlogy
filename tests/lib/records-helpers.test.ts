/**
 * The dental record's pure rules: FDI tooth numbers, the prescription check
 * code, and how a patient is named on the public check.
 */

import { describe, expect, it } from 'vitest';
import { firstNameAndInitial, newVerifyCode, parseTeeth } from '@/platform/records/service';

describe('parseTeeth', () => {
  it('reads FDI numbers in any separator, de-duplicated and sorted', () => {
    expect(parseTeeth('26, 16 26;11')).toEqual([11, 16, 26]);
    expect(parseTeeth('55 85')).toEqual([55, 85]);
    expect(parseTeeth('')).toEqual([]);
    expect(parseTeeth(undefined)).toEqual([]);
  });
  it('refuses what is not a tooth', () => {
    for (const bad of ['19', '10', '49', '56', '90', '1', 'upper', '16a']) expect(() => parseTeeth(bad)).toThrow(/not a tooth number/);
  });
});

describe('newVerifyCode', () => {
  it('is 16 unambiguous symbols and does not repeat', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => newVerifyCode()));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{16}$/);
  });
});

describe('firstNameAndInitial', () => {
  it('gives a first name and the last name’s initial, never more', () => {
    expect(firstNameAndInitial('Asha Rani wadhwa')).toBe('Asha W.');
    expect(firstNameAndInitial('Ravi')).toBe('Ravi');
    expect(firstNameAndInitial('  ')).toBe('Patient');
    expect(firstNameAndInitial(null)).toBe('Patient');
  });
});
