/** Knowledge articles' pure rules: URL slugs and reading time. */

import { describe, expect, it } from 'vitest';
import { slugify } from '@/platform/knowledge/service';
import { readingMinutes } from '@/platform/knowledge/labels';

describe('slugify', () => {
  it('makes a short, readable, ASCII URL segment', () => {
    expect(slugify('Root Canal Treatment: What to Expect?')).toBe('root-canal-treatment-what-to-expect');
    expect(slugify('  Crème brûlée & your teeth ')).toBe('creme-brulee-your-teeth');
    expect(slugify('दाँत')).toBe('article');
    expect(slugify('a'.repeat(120)).length).toBeLessThanOrEqual(80);
    expect(slugify('word '.repeat(40))).not.toMatch(/-$/);
  });
});

describe('readingMinutes', () => {
  it('rounds at 200 words a minute, never below one', () => {
    expect(readingMinutes('short')).toBe(1);
    expect(readingMinutes('word '.repeat(1000))).toBe(5);
  });
});
