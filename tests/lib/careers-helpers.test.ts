/** Careers' pure rule: how stated pay reads. */

import { describe, expect, it } from 'vitest';
import { payText } from '@/platform/careers/labels';

describe('payText', () => {
  it('reads a range, a floor, a ceiling, a stipend, or nothing', () => {
    expect(payText(4_500_000, 7_000_000, 'JOB')).toBe('₹45,000–₹70,000 a month');
    expect(payText(4_500_000, null, 'JOB')).toBe('from ₹45,000 a month');
    expect(payText(null, 7_000_000, 'JOB')).toBe('up to ₹70,000 a month');
    expect(payText(800_000, 800_000, 'INTERNSHIP')).toBe('Stipend ₹8,000 a month');
    expect(payText(null, null, 'JOB')).toBeNull();
    expect(payText(15_00_000_00, null, 'JOB')).toBe('from ₹15,00,000 a month');
  });
});
