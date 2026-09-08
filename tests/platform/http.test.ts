/**
 * TL-TEST-HTTP-001 — API envelope, errors and list conventions
 *
 * The property that matters most here is that an unexpected exception never
 * leaks its message to a client. Everything else in the API layer is a
 * convention; that one is a security boundary.
 */

import { describe, expect, it } from 'vitest';
import {
  AppError,
  ERROR_CODES,
  errors,
  isAppError,
  statusForCode,
  toAppError,
} from '@/platform/kernel/errors';
import { errorEnvelope, jsonSafe, successEnvelope } from '@/platform/http/envelope';
import {
  decodeCursor,
  encodeCursor,
  paginate,
  parseFilters,
  parseListQuery,
  parseSort,
} from '@/platform/http/query';
import {
  InMemoryIdempotencyStore,
  InMemoryRateLimitStore,
  RATE_LIMIT_POLICIES,
  checkIdempotency,
  contentSecurityPolicy,
  enforceRateLimit,
  fingerprintRequest,
  securityHeaders,
} from '@/platform/http/security';

describe('error taxonomy', () => {
  it('maps codes to the intended HTTP statuses', () => {
    expect(statusForCode(ERROR_CODES.VALIDATION_FAILED)).toBe(400);
    expect(statusForCode(ERROR_CODES.UNAUTHENTICATED)).toBe(401);
    expect(statusForCode(ERROR_CODES.FORBIDDEN)).toBe(403);
    expect(statusForCode(ERROR_CODES.NOT_FOUND)).toBe(404);
    expect(statusForCode(ERROR_CODES.RATE_LIMITED)).toBe(429);
    expect(statusForCode(ERROR_CODES.NOT_CONFIGURED)).toBe(503);
    expect(statusForCode(ERROR_CODES.INTERNAL)).toBe(500);
  });

  it('maps a disabled feature to 404, not 403', () => {
    // So flag state cannot be probed from outside to discover unreleased work.
    expect(statusForCode(ERROR_CODES.FEATURE_DISABLED)).toBe(404);
    expect(errors.featureDisabled('secret_feature').message).toBe('Not found.');
  });

  it('never exposes an internal error message', () => {
    const internal = errors.internal('Database connection string is invalid: postgres://u:p@h/db');
    expect(internal.expose).toBe(false);
    expect(internal.toPublicJSON().message).toBe('An unexpected error occurred.');
    expect(JSON.stringify(internal.toPublicJSON())).not.toContain('postgres://');
  });

  it('converts an unexpected throw into a non-exposed internal error', () => {
    // The boundary between "errors we designed" and "errors that escaped".
    const converted = toAppError(new Error('ECONNREFUSED 10.0.0.5:5432'));
    expect(converted.code).toBe(ERROR_CODES.INTERNAL);
    expect(converted.expose).toBe(false);
    expect(converted.toPublicJSON().message).not.toContain('10.0.0.5');
    // The original is preserved for the log.
    expect((converted.cause as Error).message).toContain('10.0.0.5');
  });

  it('converts non-Error throws safely', () => {
    expect(toAppError('a string').code).toBe(ERROR_CODES.INTERNAL);
    expect(toAppError(undefined).code).toBe(ERROR_CODES.INTERNAL);
    expect(toAppError(null).expose).toBe(false);
  });

  it('passes an AppError through unchanged', () => {
    const original = errors.notFound('Clinic');
    expect(toAppError(original)).toBe(original);
    expect(isAppError(original)).toBe(true);
  });

  it('exposes expected errors with their details', () => {
    const validation = errors.validation('Email is invalid.', { field: 'email' });
    expect(validation.expose).toBe(true);
    expect(validation.toPublicJSON().details).toEqual({ field: 'email' });
  });

  it('names the missing permission on a forbidden error', () => {
    const forbidden = errors.forbidden('tl.core.role.assign');
    expect(forbidden.toPublicJSON().details).toEqual({
      requiredPermission: 'tl.core.role.assign',
    });
  });

  it('reports a not-configured integration by name', () => {
    const notConfigured = errors.notConfigured('payment gateway');
    expect(notConfigured.code).toBe(ERROR_CODES.NOT_CONFIGURED);
    expect(notConfigured.message).toContain('payment gateway');
  });
});

describe('response envelope', () => {
  it('wraps success with a request ID', () => {
    const envelope = successEnvelope({ value: 1 }, 'req_abc');
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ value: 1 });
    expect(envelope.meta.requestId).toBe('req_abc');
    expect(typeof envelope.meta.timestamp).toBe('string');
  });

  it('includes the request ID on errors too', () => {
    // The ID must be present precisely when something failed — that is when a
    // user reports it and support needs to find the log line.
    const { envelope } = errorEnvelope(errors.notFound('Dentist'), 'req_xyz');
    expect(envelope.ok).toBe(false);
    expect(envelope.meta.requestId).toBe('req_xyz');
    expect(envelope.error.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it('serialises bigint and Date for JSON', () => {
    // Money amounts are bigint; JSON.stringify throws on them, so every
    // endpoint returning a price would crash without this.
    const serialised = jsonSafe({
      amount: 12345n,
      when: new Date('2026-01-01T00:00:00.000Z'),
      nested: { deep: [1n, 2n] },
    }) as Record<string, unknown>;

    expect(serialised.amount).toBe('12345');
    expect(serialised.when).toBe('2026-01-01T00:00:00.000Z');
    expect(() => JSON.stringify(serialised)).not.toThrow();
  });
});

describe('pagination', () => {
  it('detects another page from one extra row', () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id_${i}` }));
    const page = paginate(rows, 20, (r) => r.id);

    expect(page.items).toHaveLength(20);
    expect(page.pageInfo.hasMore).toBe(true);
    expect(page.pageInfo.nextCursor).not.toBeNull();
  });

  it('reports no next page on the last page', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id_${i}` }));
    const page = paginate(rows, 20, (r) => r.id);

    expect(page.items).toHaveLength(5);
    expect(page.pageInfo.hasMore).toBe(false);
    expect(page.pageInfo.nextCursor).toBeNull();
  });

  it('handles an empty result set', () => {
    const page = paginate([], 20, (r: { id: string }) => r.id);
    expect(page.items).toEqual([]);
    expect(page.pageInfo.nextCursor).toBeNull();
  });

  it('round-trips a cursor and rejects a malformed one', () => {
    expect(decodeCursor(encodeCursor('usr_123'))).toBe('usr_123');
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow(/invalid pagination cursor/i);
  });
});

describe('sorting and filtering', () => {
  it('parses ascending and descending sorts', () => {
    expect(parseSort('createdAt', ['createdAt'], { field: 'id', direction: 'asc' })).toEqual({
      field: 'createdAt',
      direction: 'asc',
    });
    expect(parseSort('-createdAt', ['createdAt'], { field: 'id', direction: 'asc' })).toEqual({
      field: 'createdAt',
      direction: 'desc',
    });
  });

  it('falls back when no sort is given', () => {
    const fallback = { field: 'id', direction: 'asc' } as const;
    expect(parseSort(null, ['createdAt'], fallback)).toEqual(fallback);
  });

  it('rejects a sort field that is not allow-listed', () => {
    // An allow-list is what keeps a client-supplied column name out of an ORM's
    // orderBy — an injection risk and a schema leak.
    expect(() => parseSort('password', ['createdAt'], { field: 'id', direction: 'asc' })).toThrow(
      /cannot sort by/i,
    );
  });

  it('rejects an unknown filter rather than ignoring it', () => {
    // A silently dropped filter returns MORE data than asked for — the
    // dangerous direction to fail in.
    const params = new URLSearchParams('filter[secret]=1');
    expect(() => parseFilters(params, ['status'])).toThrow(/unknown filter/i);
  });

  it('parses allowed filters and ignores unrelated params', () => {
    const params = new URLSearchParams('filter[status]=active&limit=10&other=x');
    expect(parseFilters(params, ['status'])).toEqual({ status: 'active' });
  });

  it('parses a full list query', () => {
    const url = new URL('https://example.test/api/v1/x?limit=5&sort=-createdAt&q=molar&filter[status]=active');
    const parsed = parseListQuery(url, {
      sortableFields: ['createdAt'],
      filterableFields: ['status'],
      defaultSort: { field: 'createdAt', direction: 'desc' },
    });

    expect(parsed.pagination.limit).toBe(5);
    expect(parsed.sort).toEqual({ field: 'createdAt', direction: 'desc' });
    expect(parsed.filters).toEqual({ status: 'active' });
    expect(parsed.q).toBe('molar');
  });

  it('rejects a page size above the maximum', () => {
    // So one request cannot ask for the whole table.
    const url = new URL('https://example.test/api/v1/x?limit=100000');
    expect(() =>
      parseListQuery(url, {
        sortableFields: ['createdAt'],
        filterableFields: [],
        defaultSort: { field: 'createdAt', direction: 'desc' },
      }),
    ).toThrow(/invalid pagination/i);
  });
});

describe('security headers', () => {
  it('sets the headers that close specific attacks', () => {
    const headers = securityHeaders(true);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
  });

  it('omits HSTS outside production', () => {
    // HSTS would break local HTTP development, and browsers remember it for a
    // year — an expensive mistake to make on a developer machine.
    expect(securityHeaders(false)['Strict-Transport-Security']).toBeUndefined();
  });

  it('denies camera, microphone and geolocation by default', () => {
    expect(securityHeaders(true)['Permissions-Policy']).toContain('geolocation=()');
  });

  it('blocks inline scripts and framing in the CSP', () => {
    const csp = contentSecurityPolicy(true);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    // Inline styles are permitted (Next.js hydration needs them); inline
    // scripts — the half that matters for XSS — are not.
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe('rate limiting', () => {
  it('allows up to the limit and then rejects', async () => {
    const store = new InMemoryRateLimitStore();
    const policy = RATE_LIMIT_POLICIES['auth-strict']!;

    for (let i = 0; i < policy.limit; i += 1) {
      const result = await store.hit('ip:1.2.3.4', policy);
      expect(result.allowed).toBe(true);
    }

    const blocked = await store.hit('ip:1.2.3.4', policy);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate counters per key', async () => {
    const store = new InMemoryRateLimitStore();
    const policy = RATE_LIMIT_POLICIES['auth-strict']!;

    for (let i = 0; i < policy.limit; i += 1) await store.hit('ip:1.1.1.1', policy);

    expect((await store.hit('ip:2.2.2.2', policy)).allowed).toBe(true);
  });

  it('throws RATE_LIMITED with a retry hint', async () => {
    const store = new InMemoryRateLimitStore();
    const policy = RATE_LIMIT_POLICIES['auth-strict']!;
    for (let i = 0; i < policy.limit; i += 1) await store.hit('ip:9.9.9.9', policy);

    await expect(enforceRateLimit(store, 'ip:9.9.9.9', 'auth-strict')).rejects.toThrow(
      /too many requests/i,
    );
  });

  it('does not block traffic for an unknown policy name', async () => {
    const store = new InMemoryRateLimitStore();
    await expect(enforceRateLimit(store, 'ip:1', 'no-such-policy')).resolves.toBeUndefined();
  });
});

describe('idempotency', () => {
  it('proceeds when no key is supplied', async () => {
    const store = new InMemoryIdempotencyStore();
    const outcome = await checkIdempotency(store, null, 'fp');
    expect(outcome.kind).toBe('proceed');
  });

  it('replays the original response for a repeated key and body', async () => {
    // The flaky-network retry: without this the patient is charged twice.
    const store = new InMemoryIdempotencyStore();
    const fingerprint = fingerprintRequest('POST', '/api/v1/pay', { amount: 100 });

    await store.put({
      key: 'idem_1',
      fingerprint,
      statusCode: 200,
      responseBody: { paymentId: 'pay_1' },
      createdAt: new Date(),
    });

    const outcome = await checkIdempotency(store, 'idem_1', fingerprint);
    expect(outcome.kind).toBe('replay');
    if (outcome.kind === 'replay') {
      expect(outcome.record.responseBody).toEqual({ paymentId: 'pay_1' });
    }
  });

  it('rejects a reused key with a different body', async () => {
    // A client bug. Answering it with the cached response would return the
    // wrong result for a genuinely different operation.
    const store = new InMemoryIdempotencyStore();
    await store.put({
      key: 'idem_2',
      fingerprint: fingerprintRequest('POST', '/api/v1/pay', { amount: 100 }),
      statusCode: 200,
      responseBody: {},
      createdAt: new Date(),
    });

    const differentBody = fingerprintRequest('POST', '/api/v1/pay', { amount: 999 });
    await expect(checkIdempotency(store, 'idem_2', differentBody)).rejects.toThrow(
      /already used for a different request/i,
    );
  });

  it('fingerprints identical requests identically and different ones differently', () => {
    const a = fingerprintRequest('POST', '/x', { v: 1 });
    const b = fingerprintRequest('POST', '/x', { v: 1 });
    const c = fingerprintRequest('POST', '/x', { v: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('AppError construction', () => {
  it('defaults exposure by code', () => {
    expect(new AppError(ERROR_CODES.NOT_FOUND, 'x').expose).toBe(true);
    expect(new AppError(ERROR_CODES.INTERNAL, 'x').expose).toBe(false);
  });
});
