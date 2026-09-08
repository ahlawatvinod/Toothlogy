/**
 * TOOTHLOGY GLOBALIZATION REGISTRY — countries, languages, currencies, timezones
 *
 * Constitution §4: country, language, currency and timezone are *inputs to every
 * layer*, never constants. This file is the single source of truth for that
 * reference data; no module may hard-code a country code, currency symbol or
 * locale.
 *
 * `enabled: false` means "modelled and supported by the architecture, but not
 * open for onboarding yet". It is the switch that lets a new market open as a
 * configuration change rather than a code change.
 *
 * India is enabled first. That is a go-to-market decision recorded in data —
 * not an architectural assumption anywhere in the codebase.
 *
 * This is a deliberately representative seed, not an exhaustive ISO dump. Full
 * ISO 3166 / 4217 / IANA data is loaded from the database in Phase 1
 * (Division 29); shipping a partial hard-coded list as if it were complete would
 * violate Constitution P9.
 */

import type { Country, Currency, Language, Timezone } from './types';

// ---------------------------------------------------------------------------
// Currencies (ISO 4217)
// ---------------------------------------------------------------------------

/**
 * `minorUnits` is load-bearing, not decorative: all money is stored as an
 * integer count of minor units, and this is the exponent used to render it.
 * JPY has 0 — code that assumes "cents are always 1/100" is already broken for
 * one of the world's largest economies. See `src/platform/money`.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorUnits: 2, enabled: true },
  { code: 'USD', name: 'US Dollar', symbol: '$', minorUnits: 2, enabled: false },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnits: 2, enabled: false },
  { code: 'GBP', name: 'Pound Sterling', symbol: '£', minorUnits: 2, enabled: false },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', minorUnits: 2, enabled: false },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', minorUnits: 2, enabled: false },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', minorUnits: 2, enabled: false },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', minorUnits: 2, enabled: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorUnits: 0, enabled: false },
] as const;

export const CURRENCY_BY_CODE: ReadonlyMap<string, Currency> = new Map(
  CURRENCIES.map((c) => [c.code, c]),
);

// ---------------------------------------------------------------------------
// Languages (BCP 47)
// ---------------------------------------------------------------------------

/**
 * Arabic and Urdu are seeded specifically because they are RTL. Keeping at least
 * one RTL language in the registry from day one means the design system's RTL
 * support is exercised rather than theoretical (Constitution §4).
 */
export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr', enabled: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr', enabled: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr', enabled: false },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', direction: 'ltr', enabled: false },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr', enabled: false },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', direction: 'ltr', enabled: false },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr', enabled: false },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr', enabled: false },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', direction: 'ltr', enabled: false },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr', enabled: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl', enabled: false },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl', enabled: false },
  { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr', enabled: false },
  { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr', enabled: false },
] as const;

export const LANGUAGE_BY_CODE: ReadonlyMap<string, Language> = new Map(
  LANGUAGES.map((l) => [l.code, l]),
);

export const DEFAULT_LOCALE = 'en';

/** Locales the app currently builds routes for. */
export const ENABLED_LOCALES: readonly string[] = LANGUAGES.filter((l) => l.enabled).map(
  (l) => l.code,
);

export function isRtl(localeCode: string): boolean {
  return LANGUAGE_BY_CODE.get(localeCode)?.direction === 'rtl';
}

// ---------------------------------------------------------------------------
// Countries (ISO 3166-1 alpha-2)
// ---------------------------------------------------------------------------

/**
 * `taxRegime` selects the pricing engine's tax strategy (Constitution §4).
 * It is a strategy key, not a rate: rates vary by state, product class and date,
 * and belong in per-country configuration, never in this table.
 */
export const COUNTRIES: readonly Country[] = [
  {
    code: 'IN',
    name: 'India',
    defaultCurrency: 'INR',
    defaultLocale: 'en',
    defaultTimezone: 'Asia/Kolkata',
    callingCode: '+91',
    taxRegime: 'gst',
    enabled: true,
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    defaultCurrency: 'AED',
    defaultLocale: 'en',
    defaultTimezone: 'Asia/Dubai',
    callingCode: '+971',
    taxRegime: 'vat',
    enabled: false,
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    defaultCurrency: 'SAR',
    defaultLocale: 'ar',
    defaultTimezone: 'Asia/Riyadh',
    callingCode: '+966',
    taxRegime: 'vat',
    enabled: false,
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    defaultCurrency: 'GBP',
    defaultLocale: 'en',
    defaultTimezone: 'Europe/London',
    callingCode: '+44',
    taxRegime: 'vat',
    enabled: false,
  },
  {
    code: 'US',
    name: 'United States',
    defaultCurrency: 'USD',
    defaultLocale: 'en',
    defaultTimezone: 'America/New_York',
    callingCode: '+1',
    taxRegime: 'sales_tax',
    enabled: false,
  },
  {
    code: 'SG',
    name: 'Singapore',
    defaultCurrency: 'SGD',
    defaultLocale: 'en',
    defaultTimezone: 'Asia/Singapore',
    callingCode: '+65',
    taxRegime: 'gst',
    enabled: false,
  },
  {
    code: 'AU',
    name: 'Australia',
    defaultCurrency: 'AUD',
    defaultLocale: 'en',
    defaultTimezone: 'Australia/Sydney',
    callingCode: '+61',
    taxRegime: 'gst',
    enabled: false,
  },
] as const;

export const COUNTRY_BY_CODE: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((c) => [c.code, c]),
);

export const DEFAULT_COUNTRY = 'IN';

// ---------------------------------------------------------------------------
// Timezones (IANA)
// ---------------------------------------------------------------------------

/**
 * Seeded for the countries above. Timestamps are always stored in UTC and
 * rendered in the viewer's zone (Constitution §4); this table exists so a user
 * or organization can *choose* a zone, not so the app can guess one.
 */
export const TIMEZONES: readonly Timezone[] = [
  { id: 'Asia/Kolkata', label: 'India Standard Time', countryCode: 'IN' },
  { id: 'Asia/Dubai', label: 'Gulf Standard Time', countryCode: 'AE' },
  { id: 'Asia/Riyadh', label: 'Arabia Standard Time', countryCode: 'SA' },
  { id: 'Europe/London', label: 'United Kingdom', countryCode: 'GB' },
  { id: 'America/New_York', label: 'US Eastern', countryCode: 'US' },
  { id: 'America/Chicago', label: 'US Central', countryCode: 'US' },
  { id: 'America/Denver', label: 'US Mountain', countryCode: 'US' },
  { id: 'America/Los_Angeles', label: 'US Pacific', countryCode: 'US' },
  { id: 'Asia/Singapore', label: 'Singapore', countryCode: 'SG' },
  { id: 'Australia/Sydney', label: 'Australian Eastern', countryCode: 'AU' },
] as const;

export const TIMEZONE_BY_ID: ReadonlyMap<string, Timezone> = new Map(
  TIMEZONES.map((t) => [t.id, t]),
);

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
