/**
 * TOOTHLOGY LIST QUERY CONVENTIONS — pagination, filtering, sorting, search
 *
 * Founding spec §12. Defined once so every list endpoint in every division
 * behaves identically, and a client that can page one collection can page all
 * of them.
 *
 * **Pagination is cursor-based, not offset-based.** `?page=5&size=20` re-runs
 * `OFFSET 80` on every request: the database still walks the skipped rows, so
 * deep pages get slower as data grows, and any insert during paging shifts
 * every subsequent page — producing duplicated and skipped rows. A cursor
 * pointing at the last item seen is stable under concurrent writes and stays
 * fast at any depth. Offset paging is the single most common cause of
 * "sometimes a result appears twice" in list UIs.
 */

import { z } from 'zod';
import { AppError, ERROR_CODES } from '../kernel/errors';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationSchema = z.object({
  /** Opaque cursor from a previous response's `nextCursor`. */
  cursor: z.string().max(512).optional(),
  /** Capped so one request cannot ask for the whole table. */
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export interface PageInfo {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly limit: number;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly pageInfo: PageInfo;
}

/**
 * Build a paginated result from one extra row.
 *
 * The caller fetches `limit + 1` rows. If the extra one came back there is
 * another page — which avoids a second `COUNT(*)` query that would double the
 * cost of every list request just to render a "next" button.
 */
export function paginate<T>(
  rows: readonly T[],
  limit: number,
  cursorOf: (item: T) => string,
): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    pageInfo: {
      hasMore,
      limit,
      nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
    },
  };
}

/**
 * Cursors are base64url-encoded.
 *
 * Not for secrecy — it is trivially decodable — but to signal that the value is
 * opaque. A cursor that looks like a readable ID invites clients to construct
 * one by hand, and then the cursor format can never change.
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Decode a cursor, rejecting anything malformed.
 *
 * `Buffer.from(value, 'base64url')` does NOT throw on invalid input — it
 * silently discards characters outside the alphabet. Decoding without
 * validation therefore turns `'!!!garbage!!!'` into a plausible-looking string
 * that is then used as a database cursor. The character check and the
 * round-trip comparison are what make a bad cursor a clean 400 instead of an
 * unpredictable query.
 */
export function decodeCursor(cursor: string): string {
  const invalid = () =>
    new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid pagination cursor.', {
      details: { field: 'cursor' },
    });

  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid();

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  if (decoded.length === 0) throw invalid();

  // Re-encoding must reproduce the input exactly. This catches values that use
  // the right alphabet but are not valid base64url — a truncated or padded
  // cursor, or one a client tried to construct by hand.
  if (Buffer.from(decoded, 'utf8').toString('base64url') !== cursor) throw invalid();

  return decoded;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';

export interface SortInput {
  readonly field: string;
  readonly direction: SortDirection;
}

/**
 * Parse `?sort=-createdAt` (leading `-` means descending).
 *
 * `allowedFields` is required, not optional. Passing a client-supplied column
 * name into an ORM's `orderBy` is an injection risk and leaks schema details
 * through error messages; an allow-list makes the safe path the only path.
 */
export function parseSort(
  raw: string | null | undefined,
  allowedFields: readonly string[],
  fallback: SortInput,
): SortInput {
  if (!raw) return fallback;

  const descending = raw.startsWith('-');
  const field = descending ? raw.slice(1) : raw;

  if (!allowedFields.includes(field)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `Cannot sort by '${field}'. Allowed: ${allowedFields.join(', ')}.`,
      { details: { field: 'sort', allowed: allowedFields } },
    );
  }

  return { field, direction: descending ? 'desc' : 'asc' };
}

// ---------------------------------------------------------------------------
// Filtering and search
// ---------------------------------------------------------------------------

export const searchSchema = z.object({
  /**
   * Bounded length. An unbounded search term can be turned into an expensive
   * full-text query — a cheap denial-of-service against the database.
   */
  q: z.string().trim().min(1).max(200).optional(),
});

/**
 * Parse `?filter[status]=active&filter[country]=IN` into a validated object.
 *
 * Same allow-list discipline as sorting: an unknown filter key is rejected
 * rather than ignored, because a silently dropped filter returns *more* data
 * than the caller asked for — the dangerous direction to fail in.
 */
export function parseFilters(
  params: URLSearchParams,
  allowedKeys: readonly string[],
): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    const match = /^filter\[(\w+)\]$/.exec(key);
    if (!match) continue;

    const field = match[1]!;
    if (!allowedKeys.includes(field)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        `Unknown filter '${field}'. Allowed: ${allowedKeys.join(', ')}.`,
        { details: { field: `filter[${field}]`, allowed: allowedKeys } },
      );
    }
    if (value.length > 200) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, `Filter '${field}' value is too long.`);
    }
    filters[field] = value;
  }

  return filters;
}

/** Parse the standard list query parameters in one call. */
export function parseListQuery(
  url: URL,
  options: {
    readonly sortableFields: readonly string[];
    readonly filterableFields: readonly string[];
    readonly defaultSort: SortInput;
  },
): {
  pagination: PaginationInput;
  sort: SortInput;
  filters: Record<string, string>;
  q?: string;
} {
  const params = url.searchParams;

  const pagination = paginationSchema.safeParse({
    cursor: params.get('cursor') ?? undefined,
    limit: params.get('limit') ?? undefined,
  });
  if (!pagination.success) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid pagination parameters.', {
      details: { issues: pagination.error.issues.map((i) => i.message) },
    });
  }

  const search = searchSchema.safeParse({ q: params.get('q') ?? undefined });
  if (!search.success) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Invalid search term.', {
      details: { field: 'q' },
    });
  }

  return {
    pagination: pagination.data,
    sort: parseSort(params.get('sort'), options.sortableFields, options.defaultSort),
    filters: parseFilters(params, options.filterableFields),
    ...(search.data.q ? { q: search.data.q } : {}),
  };
}
