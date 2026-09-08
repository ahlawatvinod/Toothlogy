/**
 * TL-API-LOCALES-001 — GET /api/v1/i18n/locales
 *
 * Public localization reference data.
 *
 * Exists so no client — web, mobile, or a partner integration — has to hard-code
 * a list of supported languages, currencies or countries. When a new market
 * opens, every client learns about it from this endpoint rather than from a
 * release (Constitution §4).
 *
 * Only *enabled* entries are returned: the registry also contains markets that
 * are modelled but not yet open, and publishing those would advertise
 * availability that does not exist.
 */

import { COUNTRIES, CURRENCIES, DEFAULT_LOCALE, LANGUAGES } from '@/registry/globalization';
import { defineRoute } from '@/platform/http/handler';

export const GET = defineRoute({
  id: 'TL-API-LOCALES-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: () => ({
    defaultLocale: DEFAULT_LOCALE,
    languages: LANGUAGES.filter((l) => l.enabled).map((l) => ({
      code: l.code,
      name: l.name,
      nativeName: l.nativeName,
      direction: l.direction,
    })),
    countries: COUNTRIES.filter((c) => c.enabled).map((c) => ({
      code: c.code,
      name: c.name,
      defaultCurrency: c.defaultCurrency,
      defaultLocale: c.defaultLocale,
      defaultTimezone: c.defaultTimezone,
      callingCode: c.callingCode,
    })),
    currencies: CURRENCIES.filter((c) => c.enabled).map((c) => ({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      // Clients need this to render and parse amounts correctly — it is not
      // safe to assume two decimal places.
      minorUnits: c.minorUnits,
    })),
  }),
});
