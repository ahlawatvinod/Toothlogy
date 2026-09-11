/**
 * TL-API-GEO-COUNTRIES-001 — GET /api/v1/geo?resource=countries
 * (and resource=regions&country=IN, resource=cities&region=…|q=…)
 *
 * Public reference geography for address forms and the location picker: the
 * countries Toothlogy knows (with whether each is open for onboarding), their
 * first-level regions under the local name for them, and cities with
 * coordinates. One endpoint with a `resource` parameter because all three are
 * the same cacheable, public reference data.
 */

import { z } from 'zod';
import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { addressRules } from '@/platform/i18n/address';
import { COUNTRY_BY_CODE } from '@/registry/globalization';

export const dynamic = 'force-dynamic';

const query = z.discriminatedUnion('resource', [
  z.object({ resource: z.literal('countries') }),
  z.object({ resource: z.literal('regions'), country: z.string().length(2).toUpperCase() }),
  z.object({
    resource: z.literal('cities'),
    region: z.string().max(64).optional(),
    country: z.string().length(2).toUpperCase().optional(),
    q: z.string().trim().max(80).optional(),
  }),
  z.object({
    resource: z.literal('holidays'),
    country: z.string().length(2).toUpperCase(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
]);

export const GET = defineRoute({
  id: 'TL-API-GEO-COUNTRIES-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ url }) => {
    const parsed = query.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw errors.validation('Ask for resource=countries, regions or cities.');
    const input = parsed.data;

    if (input.resource === 'countries') {
      const rows = await db().country.findMany({ orderBy: { name: 'asc' } });
      return {
        countries: rows.map((c) => {
          const rules = addressRules(c.code);
          return {
            code: c.code,
            name: c.name,
            enabled: c.enabled,
            currency: c.defaultCurrency,
            locale: c.defaultLocale,
            timezone: c.defaultTimezone,
            callingCode: c.callingCode,
            postalCodeLabel: rules.postalCodeLabel,
            postalCodeRequired: rules.postalCodePattern !== null,
            regionLabel: rules.regionLabel,
          };
        }),
      };
    }

    if (input.resource === 'regions') {
      if (!COUNTRY_BY_CODE.has(input.country)) throw errors.notFound('Country');
      const regions = await db().region.findMany({
        where: { countryCode: input.country },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true },
      });
      return { country: input.country, regionLabel: addressRules(input.country).regionLabel, regions };
    }

    if (input.resource === 'holidays') {
      const year = input.year ?? new Date().getUTCFullYear();
      const holidays = await db().holiday.findMany({
        where: {
          countryCode: input.country,
          date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
        },
        orderBy: { date: 'asc' },
        select: { date: true, name: true, regionId: true, isPublic: true },
      });
      return {
        country: input.country,
        year,
        // Calendar days, not instants: rendered as YYYY-MM-DD so no timezone
        // can move a holiday onto the wrong day.
        holidays: holidays.map((h) => ({ ...h, date: h.date.toISOString().slice(0, 10) })),
      };
    }

    const cities = await db().city.findMany({
      where: {
        ...(input.region ? { regionId: input.region } : {}),
        ...(input.country ? { region: { countryCode: input.country } } : {}),
        ...(input.q ? { name: { contains: input.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: 100,
      include: { region: { select: { name: true, countryCode: true } } },
    });
    return {
      cities: cities.map((c) => ({
        id: c.id,
        name: c.name,
        region: c.region.name,
        countryCode: c.region.countryCode,
        latitude: c.latitude === null ? null : Number(c.latitude),
        longitude: c.longitude === null ? null : Number(c.longitude),
      })),
    };
  },
});
