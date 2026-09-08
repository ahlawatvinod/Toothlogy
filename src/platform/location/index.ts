/**
 * TOOTHLOGY LOCATION & GEOFENCING
 *
 * Founding spec §14. Distance, radius search and geofencing are pure geometry
 * and live here with no provider dependency; geocoding and map tiles need an
 * external service and live behind ports in `./ports.ts`.
 *
 * Splitting it this way matters: "find dentists within 5 km" must work from the
 * database alone. If radius search required a maps API, every discovery query
 * would inherit that vendor's latency, rate limit and outage.
 */

import { AppError, ERROR_CODES } from '../kernel/errors';

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

export interface BoundingBox {
  readonly minLatitude: number;
  readonly maxLatitude: number;
  readonly minLongitude: number;
  readonly maxLongitude: number;
}

const EARTH_RADIUS_METRES = 6_371_008.8;

export function isValidGeoPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

export function assertValidGeoPoint(point: GeoPoint): void {
  if (!isValidGeoPoint(point)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid coordinates.', {
      details: { latitude: point.latitude, longitude: point.longitude },
    });
  }
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres (haversine).
 *
 * Treats the Earth as a sphere, which is accurate to about 0.5% — a few metres
 * over a typical "clinics near me" radius. Sufficient for ranking and filtering;
 * turn-by-turn routing goes through the routing port instead.
 */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  assertValidGeoPoint(a);
  assertValidGeoPoint(b);

  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  return distanceMetres(a, b) / 1000;
}

/**
 * A bounding box enclosing a radius, for a cheap indexed pre-filter.
 *
 * The intended query pattern: filter on the box with a plain B-tree index, then
 * compute exact distance only on what survives. Running haversine across every
 * clinic in the country is what makes an unoptimised radius search slow.
 *
 * The longitude span widens as latitude increases — a degree of longitude is
 * ~111 km at the equator and ~78 km at Delhi's latitude. Ignoring that produces
 * a box too narrow near the poles, which silently drops valid results.
 */
export function boundingBoxAround(centre: GeoPoint, radiusMetres: number): BoundingBox {
  assertValidGeoPoint(centre);
  if (!Number.isFinite(radiusMetres) || radiusMetres < 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Radius must be a non-negative number.');
  }

  const latDelta = (radiusMetres / EARTH_RADIUS_METRES) * (180 / Math.PI);
  const cosLat = Math.cos(toRadians(centre.latitude));
  // Near the poles cos(lat) approaches zero and the longitude span approaches
  // the whole globe; clamp instead of dividing by ~0.
  const lonDelta =
    Math.abs(cosLat) < 1e-9 ? 180 : (radiusMetres / (EARTH_RADIUS_METRES * cosLat)) * (180 / Math.PI);

  return {
    minLatitude: Math.max(-90, centre.latitude - latDelta),
    maxLatitude: Math.min(90, centre.latitude + latDelta),
    minLongitude: Math.max(-180, centre.longitude - Math.abs(lonDelta)),
    maxLongitude: Math.min(180, centre.longitude + Math.abs(lonDelta)),
  };
}

export function isWithinRadius(
  point: GeoPoint,
  centre: GeoPoint,
  radiusMetres: number,
): boolean {
  return distanceMetres(point, centre) <= radiusMetres;
}

// ---------------------------------------------------------------------------
// Geofencing
// ---------------------------------------------------------------------------

/**
 * Founding spec §14 requires geofences to serve appointments, clinics,
 * dentists, campaigns, notifications and fraud/risk. One shape cannot serve all
 * of those: a clinic catchment is a radius, a delivery territory or a city ward
 * is a polygon. Both are supported behind one `contains()`.
 */
export type Geofence =
  | { readonly kind: 'radius'; readonly id: string; readonly centre: GeoPoint; readonly radiusMetres: number }
  | { readonly kind: 'polygon'; readonly id: string; readonly vertices: readonly GeoPoint[] };

/** Geofence transitions. `dwell` needs time, so it is decided by the caller. */
export type GeofenceTransition = 'entry' | 'exit' | 'dwell';

export function containsPoint(fence: Geofence, point: GeoPoint): boolean {
  assertValidGeoPoint(point);

  if (fence.kind === 'radius') {
    return isWithinRadius(point, fence.centre, fence.radiusMetres);
  }
  return isPointInPolygon(point, fence.vertices);
}

/**
 * Ray-casting point-in-polygon.
 *
 * Counts crossings of a ray cast from the point; an odd count means inside.
 * Works for concave polygons, which matters because real administrative
 * boundaries and delivery territories are rarely convex.
 *
 * Treated as planar. Correct for city- and region-scale fences; a fence
 * spanning the antimeridian would need coordinates normalised first, and no
 * Toothlogy use case has one.
 */
export function isPointInPolygon(point: GeoPoint, vertices: readonly GeoPoint[]): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;

    const intersects =
      vi.latitude > point.latitude !== vj.latitude > point.latitude &&
      point.longitude <
        ((vj.longitude - vi.longitude) * (point.latitude - vi.latitude)) /
          (vj.latitude - vi.latitude) +
          vi.longitude;

    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Classify movement between two samples.
 *
 * Returns `null` when nothing changed, so a caller can emit an event only on a
 * real transition. A geofence that fires on every location ping produces
 * thousands of duplicate notifications.
 */
export function classifyTransition(
  fence: Geofence,
  previous: GeoPoint | null,
  current: GeoPoint,
  options: { readonly dwellMillis?: number; readonly insideSinceMillis?: number } = {},
): GeofenceTransition | null {
  const isInside = containsPoint(fence, current);
  const wasInside = previous ? containsPoint(fence, previous) : false;

  if (isInside && !wasInside) return 'entry';
  if (!isInside && wasInside) return 'exit';

  if (isInside && options.dwellMillis !== undefined && options.insideSinceMillis !== undefined) {
    return options.insideSinceMillis >= options.dwellMillis ? 'dwell' : null;
  }
  return null;
}

/** Sort candidates by distance, carrying the computed distance for display. */
export function sortByDistance<T extends { readonly location: GeoPoint }>(
  items: readonly T[],
  from: GeoPoint,
): Array<T & { readonly distanceMetres: number }> {
  return items
    .map((item) => ({ ...item, distanceMetres: distanceMetres(from, item.location) }))
    .sort((a, b) => a.distanceMetres - b.distanceMetres);
}
