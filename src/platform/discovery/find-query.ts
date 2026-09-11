/**
 * /find query parameters → a search request.
 *
 * A search page is reached by links people share, bookmark and edit by hand,
 * so a bad parameter is ignored with a notice rather than turning the page
 * into an error. Only filters the result type allows are applied — the same
 * allow-list the public search API enforces — so the page cannot be used to
 * probe fields the API refuses.
 *
 * Fees arrive in major units (₹) and are compared in minor units (paise):
 * money is never a float in the index (Constitution §4).
 */

import type { SearchFilter, SearchQuery } from '../search/ports';
import { FACET_FIELDS } from '../search/service';

export type FindType = 'dentist' | 'clinic';
export type FindSort = 'relevance' | 'distance' | 'price_asc';

export interface FindQuery {
  readonly type: FindType;
  readonly q: string;
  /** A place name to geocode, when no coordinates were given. */
  readonly near: string;
  readonly point: { latitude: number; longitude: number } | null;
  readonly radiusKm: number;
  readonly filters: SearchFilter[];
  readonly sort: FindSort;
  readonly cursor: string | undefined;
  /** Echoed back into the form, so a search can be refined. */
  readonly values: {
    specialty: string;
    language: string;
    treatment: string;
    appointmentType: string;
    emergency: boolean;
    feeMax: string;
  };
  /** Parameters that were ignored, in plain language. */
  readonly notices: string[];
}

const RADII = [5, 10, 25, 50, 100] as const;
const KEY = /^[a-z0-9_]{2,60}$/;
const APPOINTMENT_TYPES = new Set(['VIDEO', 'HOME_VISIT']);

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? '';
}

export function parseFindQuery(params: Params, minorUnitsPerMajor = 100): FindQuery {
  const notices: string[] = [];
  const type: FindType = one(params, 'type') === 'clinic' ? 'clinic' : 'dentist';
  const allowed = new Set(FACET_FIELDS[type]);
  const q = one(params, 'q').slice(0, 200);
  const near = one(params, 'near').slice(0, 120);

  let point: FindQuery['point'] = null;
  const lat = Number(one(params, 'lat'));
  const lng = Number(one(params, 'lng'));
  if (one(params, 'lat') || one(params, 'lng')) {
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      point = { latitude: lat, longitude: lng };
    } else {
      notices.push('The location in the link was not valid, so it was ignored.');
    }
  }

  const radiusRaw = Number(one(params, 'radius') || 25);
  const radiusKm = (RADII as readonly number[]).includes(radiusRaw) ? radiusRaw : 25;

  const filters: SearchFilter[] = [];
  const values = { specialty: '', language: '', treatment: '', appointmentType: '', emergency: false, feeMax: '' };

  const keyed = (param: string, field: string) => {
    const value = one(params, param);
    if (!value) return;
    if (!allowed.has(field)) return; // not a filter for this type; silently not applicable
    if (!KEY.test(value)) {
      notices.push(`Ignored an unrecognised ${param} filter.`);
      return;
    }
    filters.push({ field, operator: 'eq', value });
    (values as Record<string, unknown>)[param] = value;
  };
  keyed('specialty', 'specialty');
  keyed('language', 'language');
  keyed('treatment', 'treatment');

  const appointmentType = one(params, 'appointmentType');
  if (appointmentType && allowed.has('appointmentTypes')) {
    if (APPOINTMENT_TYPES.has(appointmentType)) {
      filters.push({ field: 'appointmentTypes', operator: 'eq', value: appointmentType });
      values.appointmentType = appointmentType;
    } else {
      notices.push('Ignored an unrecognised appointment type.');
    }
  }

  if (one(params, 'emergency') === '1' && allowed.has('emergency')) {
    filters.push({ field: 'emergency', operator: 'eq', value: 'true' });
    values.emergency = true;
  }

  const feeMax = one(params, 'feeMax');
  if (feeMax && allowed.has('fee')) {
    const amount = Number(feeMax);
    if (Number.isFinite(amount) && amount > 0 && amount < 1_000_000) {
      filters.push({ field: 'fee', operator: 'lte', value: Math.round(amount * minorUnitsPerMajor) });
      values.feeMax = String(amount);
    } else {
      notices.push('Ignored the maximum fee: enter an amount like 500.');
    }
  }

  const sortRaw = one(params, 'sort');
  let sort: FindSort =
    sortRaw === 'distance' || sortRaw === 'price_asc' || sortRaw === 'relevance'
      ? sortRaw
      : point || near
        ? q
          ? 'relevance'
          : 'distance'
        : 'relevance';
  if (sort === 'price_asc' && type !== 'dentist') sort = 'relevance';

  const cursor = one(params, 'cursor') || undefined;

  return { type, q, near, point, radiusKm, filters, sort, cursor: cursor?.slice(0, 200), values, notices };
}

/** The search request for a parsed query and a resolved centre point. */
export function toSearchQuery(
  query: FindQuery,
  centre: { latitude: number; longitude: number } | null,
  limit = 20,
): SearchQuery {
  const sort = query.sort === 'distance' && !centre ? 'relevance' : query.sort;
  return {
    type: query.type,
    q: query.q || undefined,
    filters: query.filters,
    geo: centre ? { centre, radiusMetres: query.radiusKm * 1000 } : undefined,
    sort,
    limit,
    cursor: query.cursor,
  };
}

export const FIND_RADII = RADII;
