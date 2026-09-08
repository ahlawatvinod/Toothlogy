/**
 * TL-TEST-I18N-001 — Internationalization
 *
 * Constitution §4: localization is structural. These tests check the parts that
 * a translation pass added later would not fix — direction, negotiation and
 * locale-correct formatting.
 */

import { describe, expect, it } from 'vitest';
import {
  createTranslator,
  formatDate,
  formatDateTime,
  formatList,
  formatNumber,
  formatRelativeTime,
  getDirection,
  getLocaleInfo,
  interpolate,
  negotiateLocale,
} from '@/platform/i18n';
import { COUNTRIES, CURRENCIES, LANGUAGES, isRtl } from '@/registry/globalization';

describe('locale and direction', () => {
  it('reports direction from the language registry', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('hi')).toBe('ltr');
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('ur')).toBe('rtl');
  });

  it('falls back to the default locale for an unknown code', () => {
    expect(getLocaleInfo('xx').code).toBe('en');
    expect(getDirection('xx')).toBe('ltr');
  });

  it('keeps at least one RTL language registered', () => {
    // So RTL support is exercised rather than theoretical (Constitution §4).
    expect(LANGUAGES.some((l) => l.direction === 'rtl')).toBe(true);
    expect(isRtl('ar')).toBe(true);
  });
});

describe('locale negotiation', () => {
  it('picks the highest-quality available language', () => {
    expect(negotiateLocale('hi;q=0.9,en;q=0.8', ['en', 'hi'])).toBe('hi');
    expect(negotiateLocale('en;q=0.9,hi;q=0.8', ['en', 'hi'])).toBe('en');
  });

  it('falls back from a regional tag to its base language', () => {
    // A browser asking for pt-BR should get Portuguese, not English.
    expect(negotiateLocale('en-GB', ['en', 'hi'])).toBe('en');
    expect(negotiateLocale('hi-IN', ['en', 'hi'])).toBe('hi');
  });

  it('falls back to the default for an absent or unmatched header', () => {
    expect(negotiateLocale(null, ['en', 'hi'])).toBe('en');
    expect(negotiateLocale('', ['en', 'hi'])).toBe('en');
    expect(negotiateLocale('fr,de', ['en', 'hi'])).toBe('en');
  });

  it('survives a malformed header without throwing', () => {
    // Accept-Language is attacker-controlled input like any other header.
    expect(() => negotiateLocale(';;;q=', ['en'])).not.toThrow();
    expect(negotiateLocale('en;q=notanumber', ['en'])).toBe('en');
  });
});

describe('messages', () => {
  it('translates a known key', () => {
    expect(createTranslator('en')('common.appName')).toBe('Toothlogy');
    expect(createTranslator('hi')('common.appName')).toBe('टूथलॉजी');
  });

  it('falls back to the default locale, then to the key itself', () => {
    // Returning the key makes a gap visible on screen rather than silently
    // rendering an empty string that looks like finished work.
    expect(createTranslator('hi')('common.skipToContent')).toBeTruthy();
    expect(createTranslator('en')('does.not.exist')).toBe('does.not.exist');
  });

  it('interpolates named placeholders', () => {
    expect(interpolate('Hello {name}, you have {count} messages', { name: 'Asha', count: 3 })).toBe(
      'Hello Asha, you have 3 messages',
    );
  });

  it('leaves an unmatched placeholder untouched', () => {
    expect(interpolate('Hello {name}', {})).toBe('Hello {name}');
  });
});

describe('formatting', () => {
  const instant = new Date('2026-06-15T09:30:00.000Z');

  it('renders a timestamp in the requested timezone, not the server\'s', () => {
    // An appointment shown in the wrong timezone is a missed appointment.
    const kolkata = formatDateTime(instant, 'en-IN', 'Asia/Kolkata');
    const newYork = formatDateTime(instant, 'en-US', 'America/New_York');
    expect(kolkata).not.toBe(newYork);
    // 09:30 UTC is 15:00 IST (+5:30).
    expect(kolkata).toMatch(/3:00/);
  });

  it('formats dates per locale convention', () => {
    expect(formatDate(instant, 'en-IN', 'Asia/Kolkata')).toContain('2026');
  });

  it('groups numbers per locale', () => {
    // en-IN uses the lakh grouping; en-US uses thousands.
    expect(formatNumber(1234567, 'en-IN')).toBe('12,34,567');
    expect(formatNumber(1234567, 'en-US')).toBe('1,234,567');
  });

  it('formats relative time', () => {
    const now = new Date('2026-06-15T09:30:00.000Z');
    expect(formatRelativeTime(new Date('2026-06-18T09:30:00.000Z'), 'en', now)).toMatch(/3 days/);
    expect(formatRelativeTime(new Date('2026-06-15T07:30:00.000Z'), 'en', now)).toMatch(/2 hours/);
  });

  it('formats lists with the locale\'s own conjunction', () => {
    // Joining with ', ' produces English punctuation for every language.
    expect(formatList(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
  });
});

describe('globalization reference data', () => {
  it('enables India first without hard-coding it as the only market', () => {
    const india = COUNTRIES.find((c) => c.code === 'IN');
    expect(india?.enabled).toBe(true);
    expect(india?.taxRegime).toBe('gst');
    // Other markets are modelled and switchable — the point of Constitution P5.
    expect(COUNTRIES.length).toBeGreaterThan(1);
    expect(COUNTRIES.some((c) => !c.enabled)).toBe(true);
  });

  it('models a zero-decimal currency', () => {
    // Guards against "cents are always 1/100" creeping back in.
    expect(CURRENCIES.find((c) => c.code === 'JPY')?.minorUnits).toBe(0);
    expect(CURRENCIES.find((c) => c.code === 'INR')?.minorUnits).toBe(2);
  });

  it('covers more than one tax regime', () => {
    const regimes = new Set(COUNTRIES.map((c) => c.taxRegime));
    expect(regimes.size).toBeGreaterThan(1);
  });
});
