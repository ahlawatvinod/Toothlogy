/**
 * TL-TEST-LOCATION-001 — Distance, radius and geofencing
 *
 * Distances are checked against known real-world city pairs rather than against
 * the formula's own output. A test that asserts haversine equals haversine
 * proves nothing; a test that says Delhi to Mumbai is about 1150 km catches an
 * inverted sign or a degrees/radians mistake immediately.
 */

import { describe, expect, it } from 'vitest';
import {
  type GeoPoint,
  boundingBoxAround,
  classifyTransition,
  containsPoint,
  distanceKm,
  distanceMetres,
  isPointInPolygon,
  isValidGeoPoint,
  isWithinRadius,
  sortByDistance,
} from '@/platform/location';

const DELHI: GeoPoint = { latitude: 28.6139, longitude: 77.209 };
const MUMBAI: GeoPoint = { latitude: 19.076, longitude: 72.8777 };
const RAIPUR: GeoPoint = { latitude: 21.2514, longitude: 81.6296 };

describe('coordinate validation', () => {
  it('accepts valid coordinates and rejects out-of-range ones', () => {
    expect(isValidGeoPoint(DELHI)).toBe(true);
    expect(isValidGeoPoint({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidGeoPoint({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidGeoPoint({ latitude: Number.NaN, longitude: 0 })).toBe(false);
  });

  it('throws on invalid coordinates rather than returning a nonsense distance', () => {
    expect(() => distanceMetres({ latitude: 999, longitude: 0 }, DELHI)).toThrow(
      /invalid coordinates/i,
    );
  });
});

describe('distance', () => {
  it('matches known real-world distances', () => {
    // Delhi–Mumbai is ~1150 km great-circle.
    expect(distanceKm(DELHI, MUMBAI)).toBeGreaterThan(1130);
    expect(distanceKm(DELHI, MUMBAI)).toBeLessThan(1170);
  });

  it('is symmetric and zero for identical points', () => {
    expect(distanceMetres(DELHI, MUMBAI)).toBeCloseTo(distanceMetres(MUMBAI, DELHI), 6);
    expect(distanceMetres(DELHI, DELHI)).toBeCloseTo(0, 6);
  });

  it('handles antipodal and equatorial extremes', () => {
    const half = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    // Half the Earth's circumference, ~20015 km.
    expect(half).toBeGreaterThan(19900);
    expect(half).toBeLessThan(20100);
  });
});

describe('bounding box', () => {
  it('encloses every point within the radius', () => {
    // The box is a cheap indexed pre-filter; if it excluded a point inside the
    // radius, that clinic would silently never appear in results.
    const radius = 5000;
    const box = boundingBoxAround(RAIPUR, radius);

    const nearby: GeoPoint = { latitude: RAIPUR.latitude + 0.03, longitude: RAIPUR.longitude };
    expect(distanceMetres(RAIPUR, nearby)).toBeLessThan(radius);
    expect(nearby.latitude).toBeLessThanOrEqual(box.maxLatitude);
    expect(nearby.latitude).toBeGreaterThanOrEqual(box.minLatitude);
  });

  it('widens the longitude span at higher latitudes', () => {
    // A degree of longitude shrinks toward the poles. A box that ignores this
    // is too narrow and drops valid results.
    const equator = boundingBoxAround({ latitude: 0, longitude: 0 }, 10_000);
    const northern = boundingBoxAround({ latitude: 60, longitude: 0 }, 10_000);

    const equatorSpan = equator.maxLongitude - equator.minLongitude;
    const northernSpan = northern.maxLongitude - northern.minLongitude;
    expect(northernSpan).toBeGreaterThan(equatorSpan);
  });

  it('clamps near the poles instead of dividing by zero', () => {
    const polar = boundingBoxAround({ latitude: 90, longitude: 0 }, 10_000);
    expect(Number.isFinite(polar.minLongitude)).toBe(true);
    expect(polar.maxLatitude).toBeLessThanOrEqual(90);
  });

  it('rejects a negative radius', () => {
    expect(() => boundingBoxAround(DELHI, -1)).toThrow(/non-negative/i);
  });
});

describe('radius geofence', () => {
  const fence = {
    kind: 'radius' as const,
    id: 'fence_clinic',
    centre: RAIPUR,
    radiusMetres: 2000,
  };

  it('includes a point inside and excludes one outside', () => {
    expect(containsPoint(fence, { latitude: 21.2551, longitude: 81.6296 })).toBe(true);
    expect(containsPoint(fence, DELHI)).toBe(false);
  });

  it('treats the boundary as inclusive', () => {
    expect(isWithinRadius(RAIPUR, RAIPUR, 0)).toBe(true);
  });
});

describe('polygon geofence', () => {
  // A simple square around the origin.
  const square: GeoPoint[] = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 10 },
    { latitude: 10, longitude: 10 },
    { latitude: 10, longitude: 0 },
  ];

  it('includes an interior point and excludes an exterior one', () => {
    expect(isPointInPolygon({ latitude: 5, longitude: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ latitude: 15, longitude: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ latitude: 5, longitude: 15 }, square)).toBe(false);
  });

  it('handles a concave polygon', () => {
    // Real administrative boundaries and delivery territories are rarely
    // convex, so ray casting must handle the L shape correctly.
    const lShape: GeoPoint[] = [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 10 },
      { latitude: 5, longitude: 10 },
      { latitude: 5, longitude: 5 },
      { latitude: 10, longitude: 5 },
      { latitude: 10, longitude: 0 },
    ];

    expect(isPointInPolygon({ latitude: 2, longitude: 2 }, lShape)).toBe(true);
    // Inside the bounding box but in the notch — must be excluded.
    expect(isPointInPolygon({ latitude: 8, longitude: 8 }, lShape)).toBe(false);
  });

  it('returns false for a degenerate polygon', () => {
    expect(isPointInPolygon({ latitude: 1, longitude: 1 }, [])).toBe(false);
    expect(
      isPointInPolygon({ latitude: 1, longitude: 1 }, [{ latitude: 0, longitude: 0 }]),
    ).toBe(false);
  });
});

describe('geofence transitions', () => {
  const fence = {
    kind: 'radius' as const,
    id: 'fence_1',
    centre: RAIPUR,
    radiusMetres: 1000,
  };
  const inside: GeoPoint = { latitude: 21.2514, longitude: 81.6296 };
  const outside: GeoPoint = DELHI;

  it('detects entry and exit', () => {
    expect(classifyTransition(fence, outside, inside)).toBe('entry');
    expect(classifyTransition(fence, inside, outside)).toBe('exit');
  });

  it('returns null when nothing changed', () => {
    // Without this, a geofence fires on every location ping and produces
    // thousands of duplicate notifications.
    expect(classifyTransition(fence, inside, inside)).toBeNull();
    expect(classifyTransition(fence, outside, outside)).toBeNull();
  });

  it('treats a first sample inside as an entry', () => {
    expect(classifyTransition(fence, null, inside)).toBe('entry');
  });

  it('reports dwell only once the threshold is met', () => {
    expect(
      classifyTransition(fence, inside, inside, { dwellMillis: 60_000, insideSinceMillis: 30_000 }),
    ).toBeNull();
    expect(
      classifyTransition(fence, inside, inside, { dwellMillis: 60_000, insideSinceMillis: 90_000 }),
    ).toBe('dwell');
  });
});

describe('sorting by distance', () => {
  it('orders nearest first and attaches the distance', () => {
    const results = sortByDistance(
      [
        { id: 'delhi', location: DELHI },
        { id: 'mumbai', location: MUMBAI },
        { id: 'raipur', location: RAIPUR },
      ],
      RAIPUR,
    );

    expect(results[0]!.id).toBe('raipur');
    expect(results[0]!.distanceMetres).toBeCloseTo(0, 0);
    expect(results[1]!.distanceMetres).toBeLessThan(results[2]!.distanceMetres);
  });
});
