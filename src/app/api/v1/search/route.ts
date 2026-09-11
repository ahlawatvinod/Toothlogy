/**
 * TL-API-SEARCH-001 — GET /api/v1/search?type=dentist&q=…&lat=…&lng=…&filter[language]=hi
 *
 * Public search across every PUBLIC entity type through the one search
 * contract. Facet filters are allow-listed per type; unknown ones are refused
 * rather than ignored, because a silently dropped filter returns more than
 * the caller asked for.
 *
 * Only published documents are ever returned — for dentists that means
 * verified, with a confirmed, locatable practice (the discovery indexer never
 * publishes anything else).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { FACET_FIELDS, parseSearchFilters, publicSearchSchema, runSearch, suggest } from '@/platform/search/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-SEARCH-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ url }) => {
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) if (!k.startsWith('filter[')) raw[k] = v;

    // Type-ahead shares the endpoint: `?type=treatment&suggest=roo`.
    if (raw.suggest !== undefined) {
      const parsed = publicSearchSchema.pick({ type: true }).safeParse(raw);
      if (!parsed.success) throw errors.validation('Choose what to search for.', { field: 'type' });
      return { suggestions: await suggest(parsed.data.type, raw.suggest.slice(0, 60)) };
    }

    const parsed = publicSearchSchema.safeParse(raw);
    if (!parsed.success) {
      throw errors.validation('Those search parameters are not valid.', {
        issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    }
    const input = parsed.data;
    if ((input.lat === undefined) !== (input.lng === undefined)) {
      throw errors.validation('Provide both lat and lng, or neither.', { field: 'lat' });
    }

    const result = await runSearch({
      type: input.type,
      q: input.q || undefined,
      filters: parseSearchFilters(input.type, url.searchParams),
      geo:
        input.lat !== undefined && input.lng !== undefined
          ? { centre: { latitude: input.lat, longitude: input.lng }, radiusMetres: input.radiusKm * 1000 }
          : undefined,
      facets: FACET_FIELDS[input.type],
      sort: input.sort,
      limit: input.limit,
      cursor: input.cursor,
      personalization: { locale: input.locale, countryCode: input.country },
    });

    return result;
  },
});
