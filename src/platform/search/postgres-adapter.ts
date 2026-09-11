/**
 * TOOTHLOGY POSTGRESQL SEARCH ADAPTER
 *
 * A real implementation of the search port on the `search_documents` table:
 *
 * - **Full text** — the weighted `searchVector` (title A, summary B, body C)
 *   maintained by a trigger, queried with `websearch_to_tsquery('english')`.
 * - **Synonyms** — the query is expanded from the `search_synonyms` table, so
 *   "rct" finds "root canal treatment" and "cleaning" finds "scaling".
 * - **Typo tolerance** — `pg_trgm` word similarity against the title, so
 *   "ortodontist" still finds orthodontists.
 * - **Radius** — a bounding-box prefilter on indexed columns, then exact
 *   haversine distance, computed in SQL.
 * - **Facets** — parameterised JSONB containment filters and per-field counts.
 *
 * RANKING IS EXPLAINABLE AND MERIT-ONLY
 *   score = ts_rank_cd(vector, query) + 0.5 · word_similarity + 0.1 · qualityScore
 * No term depends on spend. Paid placement is added by the caller as separate,
 * labelled slots (`promoted: true`) — it never alters this score (Constitution P3).
 *
 * LIMITS, STATED
 * Offset cursors capped at 1,000 results deep; trigram similarity is not
 * index-assisted for multi-field text. Comfortable to hundreds of thousands of
 * documents per type; an external engine replaces this behind the same port.
 */

import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { decodeCursor, encodeCursor } from '../http/query';
import { boundingBoxAround } from '../location';
import type {
  IndexDocument,
  SearchFilter,
  SearchHit,
  SearchPort,
  SearchQuery,
  SearchResult,
  SearchableType,
} from './ports';

const MAX_OFFSET = 1000;

interface Row {
  id: string;
  entityId: string;
  entityType: string;
  title: string;
  summary: string | null;
  facets: unknown;
  locale: string;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  qualityScore: number;
  updatedAt: Date;
  score: number;
  distance: number | null;
}

/** Terms and phrases to search for: the query itself plus synonym expansions. */
async function expandQuery(q: string, locale: string): Promise<string[]> {
  const phrase = q.toLowerCase().trim();
  const words = phrase.split(/\s+/).filter((w) => w.length > 1);
  const candidates = [...new Set([phrase, ...words])];

  const rows = await db().searchSynonym.findMany({
    where: { locale: { in: [...new Set([locale, 'en'])] }, term: { in: candidates } },
    select: { expansions: true },
  });
  return [...new Set([q.trim(), ...rows.flatMap((r) => r.expansions)])].slice(0, 12);
}

const haversine = (lat: number, lng: number) => Prisma.sql`
  (2 * 6371008.8 * asin(sqrt(
    power(sin(radians(("latitude"::float8 - ${lat}) / 2)), 2) +
    cos(radians(${lat})) * cos(radians("latitude"::float8)) *
    power(sin(radians(("longitude"::float8 - ${lng}) / 2)), 2)
  )))`;

function filterSql(filter: SearchFilter): Prisma.Sql {
  const field = filter.field;
  switch (filter.operator) {
    case 'eq':
      // JSONB containment matches a scalar AND an element of an array, so one
      // operator serves `gender: "female"` and `languages: ["en","hi"]`.
      return Prisma.sql`("facets" -> ${field}) @> to_jsonb(${String(filter.value)}::text)`;
    case 'in': {
      const values = Array.isArray(filter.value) ? filter.value : [String(filter.value)];
      if (values.length === 0) return Prisma.sql`FALSE`;
      return Prisma.sql`(${Prisma.join(
        values.map((v) => Prisma.sql`("facets" -> ${field}) @> to_jsonb(${String(v)}::text)`),
        ' OR ',
      )})`;
    }
    case 'gte':
      return Prisma.sql`("facets" ->> ${field})::numeric >= ${Number(filter.value)}`;
    case 'lte':
      return Prisma.sql`("facets" ->> ${field})::numeric <= ${Number(filter.value)}`;
    case 'contains':
      return Prisma.sql`("facets" ->> ${field}) ILIKE ${`%${String(filter.value)}%`}`;
  }
}

function orderSql(sort: SearchQuery['sort'], hasGeo: boolean): Prisma.Sql {
  switch (sort) {
    case 'distance':
      if (!hasGeo) throw errors.validation('Sorting by distance needs a location.', { field: 'sort' });
      return Prisma.sql`"distance" ASC NULLS LAST, "score" DESC`;
    case 'rating':
      return Prisma.sql`("facets" ->> 'rating')::numeric DESC NULLS LAST, "score" DESC`;
    case 'recency':
      return Prisma.sql`"updatedAt" DESC`;
    case 'price_asc':
      return Prisma.sql`("facets" ->> 'price')::numeric ASC NULLS LAST, "score" DESC`;
    case 'price_desc':
      return Prisma.sql`("facets" ->> 'price')::numeric DESC NULLS LAST, "score" DESC`;
    default:
      return Prisma.sql`"score" DESC, "qualityScore" DESC, "id" ASC`;
  }
}

async function search<T>(query: SearchQuery): Promise<SearchResult<T>> {
  const started = Date.now();
  const limit = Math.min(Math.max(query.limit, 1), 100);

  let offset = 0;
  if (query.cursor) {
    const decoded = decodeCursor(query.cursor);
    const match = /^o:(\d+)$/.exec(decoded);
    if (!match) throw errors.validation('Invalid pagination cursor.', { field: 'cursor' });
    offset = Number(match[1]);
    if (offset > MAX_OFFSET) throw errors.validation('That page is too deep. Refine the search.');
  }

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"entityType" = ${query.type}`,
    Prisma.sql`"isPublished" = TRUE`,
  ];

  let rank: Prisma.Sql = Prisma.sql`0`;
  const q = query.q?.trim();
  if (q) {
    const alternatives = await expandQuery(q, query.personalization?.locale ?? 'en');
    const tsquery = Prisma.join(
      alternatives.map((a) => Prisma.sql`websearch_to_tsquery('english', ${a})`),
      ' || ',
    );
    conditions.push(
      Prisma.sql`("searchVector" @@ (${tsquery}) OR word_similarity(${q}, "title") > 0.45)`,
    );
    rank = Prisma.sql`(ts_rank_cd("searchVector", (${tsquery})) + 0.5 * word_similarity(${q}, "title"))`;
  }

  for (const filter of query.filters ?? []) conditions.push(filterSql(filter));
  if (query.personalization?.countryCode) {
    conditions.push(Prisma.sql`("countryCode" = ${query.personalization.countryCode} OR "countryCode" IS NULL)`);
  }

  let distance: Prisma.Sql = Prisma.sql`NULL::float8`;
  if (query.geo) {
    const { centre, radiusMetres } = query.geo;
    const box = boundingBoxAround(centre, radiusMetres);
    conditions.push(
      Prisma.sql`"latitude" BETWEEN ${box.minLatitude} AND ${box.maxLatitude}`,
      Prisma.sql`"longitude" BETWEEN ${box.minLongitude} AND ${box.maxLongitude}`,
      Prisma.sql`${haversine(centre.latitude, centre.longitude)} <= ${radiusMetres}`,
    );
    distance = haversine(centre.latitude, centre.longitude);
  }

  const where = Prisma.join(conditions, ' AND ');

  const rows = await db().$queryRaw<Row[]>`
    SELECT * FROM (
      SELECT "id", "entityId", "entityType", "title", "summary", "facets", "locale", "countryCode",
             "latitude"::float8 AS "latitude", "longitude"::float8 AS "longitude",
             "qualityScore", "updatedAt",
             (${rank} + 0.1 * "qualityScore")::float8 AS "score",
             ${distance} AS "distance"
      FROM "search_documents"
      WHERE ${where}
    ) ranked
    ORDER BY ${orderSql(query.sort, Boolean(query.geo))}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;

  const countRows = await db().$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) AS "count" FROM "search_documents" WHERE ${where}
  `;
  const count = countRows[0]?.count ?? BigInt(0);

  const facets: Record<string, Array<{ value: string; count: number }>> = {};
  for (const field of query.facets ?? []) {
    const counts = await db().$queryRaw<Array<{ value: string; count: bigint }>>`
      SELECT v AS "value", count(*) AS "count"
      FROM "search_documents",
           jsonb_array_elements_text(
             CASE jsonb_typeof("facets" -> ${field})
               WHEN 'array' THEN "facets" -> ${field}
               WHEN 'string' THEN jsonb_build_array("facets" -> ${field})
               ELSE '[]'::jsonb
             END
           ) AS v
      WHERE ${where}
      GROUP BY v
      ORDER BY count(*) DESC, v ASC
      LIMIT 30
    `;
    facets[field] = counts.map((c) => ({ value: c.value, count: Number(c.count) }));
  }

  const hasMore = rows.length > limit && offset + limit <= MAX_OFFSET;
  const hits: SearchHit<T>[] = rows.slice(0, limit).map((row) => ({
    id: row.entityId,
    type: row.entityType as SearchableType,
    score: Number(row.score),
    ...(row.distance !== null ? { distanceMetres: Math.round(Number(row.distance)) } : {}),
    source: {
      title: row.title,
      summary: row.summary,
      facets: row.facets,
      locale: row.locale,
      countryCode: row.countryCode,
      latitude: row.latitude,
      longitude: row.longitude,
      qualityScore: row.qualityScore,
    } as T,
    // Organic results are never promoted. Sponsored slots are separate hits
    // added by the discovery layer with this set to true.
    promoted: false,
  }));

  return {
    hits,
    total: Number(count),
    facets,
    nextCursor: hasMore ? encodeCursor(`o:${offset + limit}`) : null,
    tookMs: Date.now() - started,
  };
}

async function index(documents: readonly IndexDocument[]): Promise<void> {
  for (const doc of documents) {
    const fields = doc.fields as {
      title?: string;
      summary?: string | null;
      body?: string;
      facets?: Record<string, unknown>;
      locale?: string;
      countryCode?: string | null;
      isPublished?: boolean;
    };
    if (!fields.title) throw errors.validation(`Search document ${doc.type}:${doc.id} has no title.`);

    const data = {
      title: fields.title,
      summary: fields.summary ?? null,
      body: fields.body ?? '',
      facets: (fields.facets ?? {}) as never,
      locale: fields.locale ?? 'en',
      countryCode: fields.countryCode ?? null,
      latitude: doc.location?.latitude ?? null,
      longitude: doc.location?.longitude ?? null,
      qualityScore: doc.qualityScore ?? 0,
      isPublished: fields.isPublished ?? true,
    };

    await db().searchDocument.upsert({
      where: { entityType_entityId: { entityType: doc.type, entityId: doc.id } },
      create: { id: `sd_${doc.type}_${doc.id}`.slice(0, 190), entityType: doc.type, entityId: doc.id, ...data },
      update: data,
    });
  }
}

async function remove(type: SearchableType, ids: readonly string[]): Promise<void> {
  await db().searchDocument.deleteMany({ where: { entityType: type, entityId: { in: [...ids] } } });
}

async function suggest(type: SearchableType, prefix: string, limit: number): Promise<readonly string[]> {
  const p = prefix.trim();
  if (p.length < 2) return [];
  const rows = await db().$queryRaw<Array<{ title: string }>>`
    SELECT DISTINCT ON ("title") "title", similarity("title", ${p}) AS s
    FROM "search_documents"
    WHERE "entityType" = ${type} AND "isPublished" = TRUE
      AND ("title" ILIKE ${`${p}%`} OR "title" ILIKE ${`% ${p}%`} OR "title" % ${p})
    ORDER BY "title", s DESC
    LIMIT ${Math.min(Math.max(limit, 1), 20) * 3}
  `;
  return rows
    .sort((a, b) => Number((b as { s?: number }).s ?? 0) - Number((a as { s?: number }).s ?? 0))
    .slice(0, limit)
    .map((r) => r.title);
}

export function createPostgresSearchAdapter(): SearchPort {
  return { search, index, remove, suggest };
}
