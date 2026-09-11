/**
 * TL-API-GEO-GEOCODE-001 — GET /api/v1/geo/geocode?q=…&country=IN
 * TL-API-GEO-REVERSE-001 — GET /api/v1/geo/geocode?lat=…&lng=…
 *
 * Forward and reverse geocoding for the location picker. Every result carries
 * `precision` — `city` from the reference gazetteer, `street` from a
 * configured maps provider — so the UI can say "approximate (city centre)"
 * instead of implying a precision it does not have.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { geocode, hasStreetGeocoding, reverseGeocode } from '@/platform/location/geocoding';

export const dynamic = 'force-dynamic';

const forward = z.object({
  q: z.string().trim().min(2).max(120),
  country: z.string().length(2).toUpperCase().optional(),
});
const reverse = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const GET = defineRoute({
  id: 'TL-API-GEO-GEOCODE-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ url }) => {
    const params = Object.fromEntries(url.searchParams);

    if (params.lat !== undefined || params.lng !== undefined) {
      const parsed = reverse.safeParse(params);
      if (!parsed.success) throw errors.validation('Provide lat and lng as numbers.');
      const result = await reverseGeocode({ latitude: parsed.data.lat, longitude: parsed.data.lng });
      return { result, streetLevelAvailable: hasStreetGeocoding() };
    }

    const parsed = forward.safeParse(params);
    if (!parsed.success) throw errors.validation('Enter a place name of at least two characters.', { field: 'q' });
    return {
      results: await geocode(parsed.data.q, parsed.data.country),
      streetLevelAvailable: hasStreetGeocoding(),
    };
  },
});
