/**
 * TOOTHLOGY GEOCODING SERVICE
 *
 * The one place callers geocode through. Uses a configured street-level
 * provider when one exists; otherwise the reference geocoder (city level). The
 * result always carries its precision, so a caller can refuse a city-centre
 * answer where it needs a street (placing a clinic) and accept it where a city
 * is enough (choosing a search area).
 */

import { errors } from '../kernel/errors';
import type { GeoPoint } from './index';
import { assertValidGeoPoint } from './index';
import { geocodingProvider, type GeocodeResult } from './ports';
import { createReferenceGeocoder } from './reference-geocoder';

export type GeocodePrecision = 'street' | 'city';

export interface PreciseGeocodeResult extends GeocodeResult {
  readonly precision: GeocodePrecision;
  readonly source: 'provider' | 'reference';
}

const reference = createReferenceGeocoder();

export async function geocode(query: string, countryCode?: string): Promise<PreciseGeocodeResult[]> {
  if (query.trim().length < 2) throw errors.validation('Enter at least two characters.', { field: 'q' });

  if (geocodingProvider.isConfigured()) {
    const results = await geocodingProvider.get().geocode(query, countryCode);
    return results.map((r) => ({ ...r, precision: 'street', source: 'provider' }));
  }
  const results = await reference.geocode(query, countryCode);
  return results.map((r) => ({ ...r, precision: 'city', source: 'reference' }));
}

export async function reverseGeocode(point: GeoPoint): Promise<PreciseGeocodeResult | null> {
  assertValidGeoPoint(point);
  if (geocodingProvider.isConfigured()) {
    const result = await geocodingProvider.get().reverseGeocode(point);
    return result ? { ...result, precision: 'street', source: 'provider' } : null;
  }
  const result = await reference.reverseGeocode(point);
  return result ? { ...result, precision: 'city', source: 'reference' } : null;
}

/** Whether street-level geocoding is available — for UIs placing a clinic. */
export function hasStreetGeocoding(): boolean {
  return geocodingProvider.isConfigured();
}
