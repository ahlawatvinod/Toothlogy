/**
 * TOOTHLOGY INTERNATIONALIZATION
 *
 * Constitution §4: localization is structural, not a translation pass bolted on
 * before a launch.
 *
 * The practical consequences this module enforces:
 *
 * - **Direction is data, not CSS.** `dir` comes from the language registry, so
 *   an RTL language works because the architecture accounts for it, not because
 *   someone remembered to add a stylesheet.
 * - **Formatting always takes a locale.** There is no `formatDate(date)` here.
 *   The absence of an implicit locale is what stops server-rendered dates from
 *   silently appearing in the server's locale for every reader on earth.
 * - **A missing translation falls back visibly in development and gracefully in
 *   production.** Silent fallback hides gaps until a user in another language
 *   finds them.
 */

import {
  DEFAULT_LOCALE,
  ENABLED_LOCALES,
  LANGUAGE_BY_CODE,
  isRtl,
} from '@/registry/globalization';
import { getEnvironment } from '../config';

export type Direction = 'ltr' | 'rtl';

export interface LocaleInfo {
  readonly code: string;
  readonly direction: Direction;
  readonly nativeName: string;
}

export function getLocaleInfo(code: string): LocaleInfo {
  const language = LANGUAGE_BY_CODE.get(code);
  if (!language) {
    const fallback = LANGUAGE_BY_CODE.get(DEFAULT_LOCALE)!;
    return {
      code: DEFAULT_LOCALE,
      direction: fallback.direction,
      nativeName: fallback.nativeName,
    };
  }
  return { code: language.code, direction: language.direction, nativeName: language.nativeName };
}

export function getDirection(locale: string): Direction {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/**
 * Negotiate a locale from an `Accept-Language` header.
 *
 * Handles quality values and falls back from a regional tag to its base
 * language, so `pt-BR` matches an available `pt`. A visitor whose browser asks
 * for Brazilian Portuguese should get Portuguese, not English.
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
  available: readonly string[] = ENABLED_LOCALES,
): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const preferences = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number.parseFloat(q.split('=')[1] ?? '1') : 1;
      return { tag: (tag ?? '').trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((p) => p.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of preferences) {
    const exact = available.find((a) => a.toLowerCase() === tag);
    if (exact) return exact;

    const base = tag.split('-')[0]!;
    const baseMatch = available.find((a) => a.toLowerCase() === base);
    if (baseMatch) return baseMatch;
  }

  return DEFAULT_LOCALE;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export type MessageCatalog = Readonly<Record<string, string>>;

/**
 * Message catalogues by locale.
 *
 * Only the foundation's own strings are seeded. Catalogues become files loaded
 * per route segment once there is content to translate — shipping a large
 * catalogue of untranslated keys would be exactly the "empty translations" state
 * the `multi_locale_routing` flag exists to keep out of production.
 */
const CATALOGS: Readonly<Record<string, MessageCatalog>> = {
  en: {
    'common.appName': 'Toothlogy',
    'common.loading': 'Loading…',
    'common.error.title': 'Something went wrong',
    'common.error.retry': 'Try again',
    'common.empty.title': 'Nothing here yet',
    'common.notFound.title': 'Page not found',
    'common.skipToContent': 'Skip to main content',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.system': 'System',
    'theme.label': 'Theme',
  },
  hi: {
    'common.appName': 'टूथलॉजी',
    'common.loading': 'लोड हो रहा है…',
    'common.error.title': 'कुछ गलत हो गया',
    'common.error.retry': 'फिर से कोशिश करें',
    'common.empty.title': 'यहाँ अभी कुछ नहीं है',
    'common.notFound.title': 'पेज नहीं मिला',
    'common.skipToContent': 'मुख्य सामग्री पर जाएँ',
    'theme.light': 'लाइट',
    'theme.dark': 'डार्क',
    'theme.system': 'सिस्टम',
    'theme.label': 'थीम',
  },
};

export interface Translator {
  (key: string, values?: Readonly<Record<string, string | number>>): string;
}

/**
 * Build a translator for a locale.
 *
 * Lookup order is requested locale → default locale → the key itself. Returning
 * the key rather than an empty string means a missing translation shows up as
 * `common.error.title` on screen — ugly, findable, and impossible to mistake for
 * finished work.
 */
export function createTranslator(locale: string): Translator {
  const primary = CATALOGS[locale] ?? {};
  const fallback = CATALOGS[DEFAULT_LOCALE] ?? {};

  return (key, values) => {
    const template = primary[key] ?? fallback[key];

    if (template === undefined) {
      if (getEnvironment() === 'development') {
        // Loud in development, quiet in production: a console warning here is
        // how a gap gets noticed while it is still cheap to fix.
        console.warn(`[i18n] Missing translation for '${key}' in locale '${locale}'.`);
      }
      return key;
    }

    return interpolate(template, values);
  };
}

/** Replace `{name}` placeholders. An unmatched placeholder is left as written. */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format a date/time in a locale AND a timezone.
 *
 * Both are required parameters. Timestamps are stored in UTC (Constitution §4),
 * so rendering one without an explicit zone would silently use the server's —
 * and an appointment shown in the wrong timezone is a missed appointment.
 */
export function formatDateTime(
  value: Date,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value);
}

export function formatDate(
  value: Date,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value);
}

export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/** Relative time — "in 3 days", "2 hours ago" — in the reader's language. */
export function formatRelativeTime(
  value: Date,
  locale: string,
  now: Date = new Date(),
): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const deltaSeconds = Math.round((value.getTime() - now.getTime()) / 1000);

  const units: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds || unit === 'second') {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return formatter.format(0, 'second');
}

/**
 * Format a list — "A, B and C" — with the locale's own conjunction and commas.
 * Joining with `', '` produces English punctuation for every language.
 */
export function formatList(
  items: readonly string[],
  locale: string,
  type: 'conjunction' | 'disjunction' = 'conjunction',
): string {
  return new Intl.ListFormat(locale, { style: 'long', type }).format(items);
}
