/**
 * TOOTHLOGY REFERENCE GEOCODER — city level, from our own gazetteer
 *
 * Resolves a place name to the centre of a city in the seeded reference
 * tables, and a coordinate to the nearest such city. It is a real geocoder
 * with a deliberately coarse answer, and it says so on every result:
 * `confidence` is at most 0.5 and the formatted address ends "(city centre)".
 *
 * WHAT IT IS FOR
 * "Show dentists near Raipur" — choosing a search centre without GPS, or
 * labelling a GPS fix with a city name. That needs a city, not a street.
 *
 * WHAT IT IS NOT FOR
 * Placing a clinic. A clinic's coordinates must come from the clinic (a map
 * pin, GPS on site) or a street-level geocoding provider (TL-INT-MAPS-001,
 * not configured). Street addresses are never "resolved" to a city centre and
 * presented as the clinic's location.
 */

import { db } from '../db/client';
import { boundingBoxAround, distanceMetres, type GeoPoint } from './index';
import type { GeocodeResult, GeocodingPort } from './ports';

/** Beyond this, the "nearest city" is not a meaningful label for a point. */
const REVERSE_MAX_METRES = 60_000;

export function createReferenceGeocoder(): GeocodingPort {
  return {
    async geocode(query: string, countryCode?: string): Promise<readonly GeocodeResult[]> {
      const q = query.trim();
      if (q.length < 2) return [];

      const cities = await db().city.findMany({
        where: {
          latitude: { not: null },
          longitude: { not: null },
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { region: { name: { contains: q, mode: 'insensitive' } } },
          ],
          ...(countryCode ? { region: { countryCode: countryCode.toUpperCase() } } : {}),
        },
        include: { region: { include: { country: true } } },
        take: 8,
      });

      return cities
        .map((city) => {
          const exact = city.name.toLowerCase() === q.toLowerCase();
          return {
            point: { latitude: Number(city.latitude), longitude: Number(city.longitude) },
            formattedAddress: `${city.name}, ${city.region.name}, ${city.region.country.name} (city centre)`,
            address: {
              lines: [],
              locality: city.name,
              region: city.region.name,
              countryCode: city.region.countryCode,
            },
            // A city centre is never a precise answer, however exact the name.
            confidence: exact ? 0.5 : 0.3,
          } satisfies GeocodeResult;
        })
        .sort((a, b) => b.confidence - a.confidence);
    },

    async reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null> {
      const box = boundingBoxAround(point, REVERSE_MAX_METRES);
      const candidates = await db().city.findMany({
        where: {
          latitude: { gte: box.minLatitude, lte: box.maxLatitude },
          longitude: { gte: box.minLongitude, lte: box.maxLongitude },
        },
        include: { region: { include: { country: true } } },
      });

      let best: { city: (typeof candidates)[number]; metres: number } | null = null;
      for (const city of candidates) {
        const metres = distanceMetres(point, {
          latitude: Number(city.latitude),
          longitude: Number(city.longitude),
        });
        if (metres <= REVERSE_MAX_METRES && (!best || metres < best.metres)) best = { city, metres };
      }
      if (!best) return null;

      return {
        point,
        formattedAddress: `Near ${best.city.name}, ${best.city.region.name}, ${best.city.region.country.name}`,
        address: {
          lines: [],
          locality: best.city.name,
          region: best.city.region.name,
          countryCode: best.city.region.countryCode,
        },
        confidence: 0.3,
      };
    },
  };
}

/**
 * A directions link for a patient's own maps app.
 *
 * A plain URL, not an integration: opening it hands the patient to Google
 * Maps (or Apple Maps on iOS, which honours the same universal link) with the
 * destination filled in. No API key, no request from our servers.
 */
export function directionsUrl(destination: GeoPoint): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.latitude},${destination.longitude}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
