/**
 * TOOTHLOGY LOCATION PROVIDER PORTS
 *
 * Geocoding, reverse geocoding and routing need an external service. Distance,
 * radius and geofencing do not, and deliberately live in `./index.ts` with no
 * provider dependency — see the note there on why discovery must not inherit a
 * maps vendor's latency and rate limits.
 *
 * 🟡 PREPARED. No adapter is registered; calls throw `NOT_CONFIGURED`.
 */

import { createProviderSlot } from '../integrations/provider';
import type { GeoPoint } from './index';

export interface StructuredAddress {
  readonly lines: readonly string[];
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  /** ISO 3166-1 alpha-2. */
  readonly countryCode: string;
}

export interface GeocodeResult {
  readonly point: GeoPoint;
  readonly formattedAddress: string;
  readonly address: StructuredAddress;
  /** 0–1. Callers should not silently accept a low-confidence match for a clinic. */
  readonly confidence: number;
}

export interface GeocodingPort {
  /**
   * Address → coordinates. Returns several candidates rather than one best
   * guess: a wrong clinic location is worse than asking the user to disambiguate.
   */
  geocode(query: string, countryCode?: string): Promise<readonly GeocodeResult[]>;

  reverseGeocode(point: GeoPoint): Promise<GeocodeResult | null>;
}

export interface RouteLeg {
  readonly distanceMetres: number;
  readonly durationSeconds: number;
  /** Encoded polyline for map display. */
  readonly polyline?: string;
}

export interface RoutingPort {
  /**
   * Travel time between two points.
   *
   * Distinct from straight-line distance: "8 minutes away" is what a patient
   * actually cares about, and in dense cities it correlates poorly with metres.
   */
  route(from: GeoPoint, to: GeoPoint, mode: 'driving' | 'walking' | 'transit'): Promise<RouteLeg>;
}

export const geocodingProvider = createProviderSlot<GeocodingPort>('geocoding');
export const routingProvider = createProviderSlot<RoutingPort>('routing');
