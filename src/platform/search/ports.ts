/**
 * TOOTHLOGY SEARCH PORTS
 *
 * Founding spec §16. One search contract serving dentists, clinics, treatments,
 * specialties, articles, research, products, vendors, internships, jobs and
 * locations.
 *
 * One contract rather than ten because the *shape* of a search is the same
 * everywhere — query, filters, facets, sort, distance, page — and the parts that
 * differ are the indexed fields, which are data. Ten bespoke search
 * implementations would mean ten different filter syntaxes for API clients and
 * ten places to fix a relevance bug.
 *
 * `distance` and `availability` are first-class rather than generic filters,
 * because in this product they are not optional refinements: "a great dentist
 * 40 km away who is booked until March" is the wrong answer to "I need a dentist".
 *
 * 🟡 PREPARED. No engine is wired. PostgreSQL full-text search will implement
 * this port first; an external engine replaces it later without any caller
 * changing.
 */

import type { GeoPoint } from '../location';
import { createProviderSlot } from '../integrations/provider';

/** Indexable entity types. Adding one is a deliberate, registered change. */
export const SEARCHABLE_TYPES = [
  'dentist',
  'clinic',
  'treatment',
  'specialty',
  'article',
  'research',
  'product',
  'vendor',
  'internship',
  'job',
  'college',
  'location',
] as const;
export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export interface SearchFilter {
  readonly field: string;
  readonly operator: 'eq' | 'in' | 'gte' | 'lte' | 'contains';
  readonly value: string | number | readonly string[];
}

export interface GeoSearch {
  readonly centre: GeoPoint;
  readonly radiusMetres: number;
}

export interface SearchQuery {
  readonly type: SearchableType;
  readonly q?: string;
  readonly filters?: readonly SearchFilter[];
  readonly geo?: GeoSearch;
  /** Field names to compute facet counts for — the sidebar's filter counts. */
  readonly facets?: readonly string[];
  readonly sort?: 'relevance' | 'distance' | 'rating' | 'recency' | 'price_asc' | 'price_desc';
  readonly limit: number;
  readonly cursor?: string;
  /**
   * Personalization signals. Optional and separated from the query so a search
   * is reproducible without them — which is what makes ranking auditable
   * (Constitution §5).
   */
  readonly personalization?: {
    readonly userId?: string;
    readonly locale?: string;
    readonly countryCode?: string;
  };
}

export interface SearchHit<T = unknown> {
  readonly id: string;
  readonly type: SearchableType;
  readonly score: number;
  readonly distanceMetres?: number;
  readonly source: T;
  /**
   * True when this result appears because it was paid for.
   *
   * Constitution P3: promoted placement is permitted, disguising it is not.
   * Carrying the flag in the search contract means the label cannot be lost
   * between the ranker and the UI — every surface receives it.
   */
  readonly promoted: boolean;
}

export interface SearchResult<T = unknown> {
  readonly hits: readonly SearchHit<T>[];
  readonly total: number;
  readonly facets: Readonly<Record<string, ReadonlyArray<{ value: string; count: number }>>>;
  readonly nextCursor: string | null;
  readonly tookMs: number;
}

export interface IndexDocument {
  readonly id: string;
  readonly type: SearchableType;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly location?: GeoPoint;
  /** Merit-based ranking input. Never derived from spend (Constitution P3). */
  readonly qualityScore?: number;
}

export interface SearchPort {
  search<T = unknown>(query: SearchQuery): Promise<SearchResult<T>>;
  index(documents: readonly IndexDocument[]): Promise<void>;
  remove(type: SearchableType, ids: readonly string[]): Promise<void>;
  /** Type-ahead. Separate from `search` because latency budgets differ by an order of magnitude. */
  suggest(type: SearchableType, prefix: string, limit: number): Promise<readonly string[]>;
}

export const searchProvider = createProviderSlot<SearchPort>('search engine');
