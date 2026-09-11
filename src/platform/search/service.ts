/**
 * TOOTHLOGY SEARCH SERVICE
 *
 * The one entry point for indexing and querying, over whichever search
 * adapter is configured: PostgreSQL by default (it is our own database, so it
 * is always available), an external engine when `SEARCH_PROVIDER` names one
 * that has an adapter. A provider named but not implemented leaves the slot
 * empty and every search fails NOT_CONFIGURED — it never silently falls back
 * and pretends to be the engine that was asked for.
 *
 * Callers pass facet field names from an allow-list per entity type, so the
 * public API cannot be used to probe arbitrary JSON paths.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { hasDatabase } from '../config';
import { SEARCHABLE_TYPES, searchProvider, type IndexDocument, type SearchQuery, type SearchableType } from './ports';
import { createPostgresSearchAdapter } from './postgres-adapter';

export function ensureSearchConfigured(): void {
  if (searchProvider.isConfigured() || !hasDatabase()) return;
  const provider = process.env.SEARCH_PROVIDER;
  if (!provider || provider === 'postgres') searchProvider.set(createPostgresSearchAdapter());
}

/** Facet fields each type may be filtered and counted by. */
export const FACET_FIELDS: Readonly<Record<SearchableType, readonly string[]>> = {
  dentist: [
    'specialty',
    'language',
    'gender',
    'verified',
    'fee',
    'experienceYears',
    'rating',
    'appointmentTypes',
    'emergency',
    'city',
    'treatment',
  ],
  clinic: ['city', 'facility', 'emergency', 'verified', 'rating', 'treatment'],
  treatment: ['specialty', 'category'],
  specialty: [],
  article: ['contentType', 'category', 'tag', 'language'],
  research: ['contentType', 'category', 'tag', 'year'],
  product: ['category', 'brand', 'price', 'vendorType', 'rating'],
  vendor: ['vendorType', 'city', 'verified'],
  internship: ['mode', 'paid', 'city', 'durationWeeks'],
  job: ['employmentType', 'city', 'mode', 'role'],
  college: ['city', 'course'],
  location: ['city'],
};

export const publicSearchSchema = z.object({
  type: z.enum(SEARCHABLE_TYPES),
  q: z.string().trim().max(200).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(500).default(25),
  sort: z.enum(['relevance', 'distance', 'rating', 'recency', 'price_asc', 'price_desc']).default('relevance'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  locale: z.string().max(10).optional(),
});

/**
 * Parse `?filter[language]=hi&filter[fee.lte]=50000&filter[specialty]=a,b` into
 * search filters, refusing any field the type does not allow.
 */
export function parseSearchFilters(type: SearchableType, params: URLSearchParams): SearchQuery['filters'] {
  const allowed = new Set(FACET_FIELDS[type]);
  const filters: NonNullable<SearchQuery['filters']>[number][] = [];

  for (const [key, raw] of params.entries()) {
    const match = /^filter\[(\w+)(?:\.(gte|lte))?\]$/.exec(key);
    if (!match) continue;
    const field = match[1]!;
    if (!allowed.has(field)) {
      throw errors.validation(`Cannot filter ${type} results by '${field}'.`, {
        field: key,
        allowed: [...allowed],
      });
    }
    if (raw.length > 200) throw errors.validation(`Filter '${field}' is too long.`);

    if (match[2]) {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw errors.validation(`Filter '${field}' needs a number.`);
      filters.push({ field, operator: match[2] as 'gte' | 'lte', value });
    } else if (raw.includes(',')) {
      filters.push({ field, operator: 'in', value: raw.split(',').map((v) => v.trim()).filter(Boolean) });
    } else {
      filters.push({ field, operator: 'eq', value: raw });
    }
  }
  return filters;
}

export async function runSearch<T = unknown>(query: SearchQuery) {
  ensureSearchConfigured();
  return searchProvider.get().search<T>(query);
}

export async function indexDocuments(documents: readonly IndexDocument[]): Promise<void> {
  ensureSearchConfigured();
  if (!searchProvider.isConfigured()) return;
  await searchProvider.get().index(documents);
}

export async function removeFromIndex(type: SearchableType, ids: readonly string[]): Promise<void> {
  ensureSearchConfigured();
  if (!searchProvider.isConfigured()) return;
  await searchProvider.get().remove(type, ids);
}

export async function suggest(type: SearchableType, prefix: string, limit = 8) {
  ensureSearchConfigured();
  return searchProvider.get().suggest(type, prefix, limit);
}
