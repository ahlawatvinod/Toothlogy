/**
 * TOOTHLOGY HTTP SECURITY — headers, rate limiting, idempotency
 *
 * Founding spec §10, §12. Three protections that must exist at the boundary,
 * because none of them can be retrofitted reliably once dozens of routes exist.
 */

import { createHash } from 'node:crypto';
import { AppError, ERROR_CODES, errors } from '../kernel/errors';
import { STRICT_TRANSPORT_SECURITY } from './csp';

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/**
 * Response headers applied to every route.
 *
 * Each one closes a specific attack:
 *
 * - **HSTS** stops a downgrade to plaintext HTTP, where session cookies are
 *   readable on the wire. Production only — it would break local development
 *   over HTTP, and a browser remembers it for a year.
 * - **X-Content-Type-Options: nosniff** stops a browser from re-interpreting an
 *   uploaded file as HTML or script. Directly relevant: patients upload X-rays
 *   and reports, and a "PNG" that sniffs as HTML is stored XSS.
 * - **X-Frame-Options / frame-ancestors** stop clickjacking — Toothlogy will
 *   have booking and payment confirmation buttons worth hijacking.
 * - **Referrer-Policy** stops a full URL (which may carry a record or
 *   appointment ID) leaking to third parties through the Referer header.
 * - **Permissions-Policy** denies camera, microphone and geolocation by default.
 *   Geolocation is enabled per-route where the GPS tool needs it, rather than
 *   granted globally.
 */
export function securityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
  };

  if (isProduction) {
    headers['Strict-Transport-Security'] = STRICT_TRANSPORT_SECURITY;
  }

  return headers;
}

/**
 * Content Security Policy — built in ./csp (dependency-free, so the request
 * proxy can use it) and applied to every HTML page by src/proxy.ts with a
 * per-request nonce. Now that patients, dentists and staff all author content
 * (reviews, messages, articles, postings), a nonce-bound policy is what keeps
 * an injected script from running.
 */
export { contentSecurityPolicy } from './csp';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export interface RateLimitPolicy {
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Named policies, referenced by the API registry's `rateLimit` field.
 *
 * Named rather than numeric so a policy can be retuned in one place, and so a
 * code review can see that a login endpoint is on the strict policy without
 * having to judge whether "5" is the right number.
 */
export const RATE_LIMIT_POLICIES: Readonly<Record<string, RateLimitPolicy>> = {
  'public-generous': { name: 'public-generous', limit: 120, windowSeconds: 60 },
  'authenticated-standard': { name: 'authenticated-standard', limit: 300, windowSeconds: 60 },
  /** Login, OTP, password reset — brute-force targets. */
  'auth-strict': { name: 'auth-strict', limit: 5, windowSeconds: 60 },
  /** Endpoints that cost money to serve, such as SMS dispatch. */
  'costly': { name: 'costly', limit: 10, windowSeconds: 3600 },
  /** File uploads: bounded so one account cannot fill the disk. */
  'uploads': { name: 'uploads', limit: 60, windowSeconds: 3600 },
  /** Signed downloads are cheap but must not become a scraping channel. */
  'downloads': { name: 'downloads', limit: 600, windowSeconds: 60 },
};

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitStore {
  /** Increment the counter for `key` and report the state of its window. */
  hit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>;
}

/**
 * In-memory fixed-window limiter.
 *
 * Correct for a single process, and explicitly **not** sufficient for
 * production: with N instances behind a load balancer, each keeps its own
 * counter and the effective limit becomes N times the intended one. Phase 1
 * replaces this with a shared store behind the same interface. Stating the
 * limitation here is the point — an in-memory limiter that is quietly assumed to
 * be distributed is worse than none, because it is trusted.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const now = Date.now();
    const windowKey = `${policy.name}:${key}`;
    const existing = this.windows.get(windowKey);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(windowKey, { count: 1, resetAt: now + policy.windowSeconds * 1000 });
      return { allowed: true, remaining: policy.limit - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;
    const remaining = Math.max(0, policy.limit - existing.count);
    const allowed = existing.count <= policy.limit;

    return {
      allowed,
      remaining,
      retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  /** Drop expired windows. Called periodically so the map cannot grow forever. */
  prune(now: number = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }

  clear(): void {
    this.windows.clear();
  }
}

export const defaultRateLimitStore = new InMemoryRateLimitStore();

/**
 * Derive the rate-limit key for a request.
 *
 * Authenticated requests are keyed by user ID rather than IP, because IP keying
 * penalises everyone behind one NAT — a whole clinic, a hospital, a university
 * campus — for one user's behaviour. Anonymous requests fall back to IP.
 */
export function rateLimitKey(userId: string | null, ipAddress: string | null): string {
  if (userId) return `user:${userId}`;
  return `ip:${ipAddress ?? 'unknown'}`;
}

export async function enforceRateLimit(
  store: RateLimitStore,
  key: string,
  policyName: string,
): Promise<void> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  if (!policy) return; // An unknown policy name must not block traffic.

  const result = await store.hit(key, policy);
  if (!result.allowed) throw errors.rateLimited(result.retryAfterSeconds);
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Idempotency makes a retried mutation safe.
 *
 * The scenario that requires it: a patient taps "Confirm booking", the response
 * is lost to a flaky mobile connection, and the app retries. Without an
 * idempotency key that is two appointments and two charges. With one, the retry
 * returns the original result.
 *
 * The stored fingerprint is a hash of the request body. If the same key arrives
 * with a *different* body, that is a client bug — a reused key for a new
 * operation — and it must be rejected loudly rather than silently returning the
 * wrong cached response.
 */
export interface IdempotencyRecord {
  readonly key: string;
  readonly fingerprint: string;
  readonly statusCode: number;
  readonly responseBody: unknown;
  readonly createdAt: Date;
}

export interface IdempotencyStore {
  get(key: string): Promise<IdempotencyRecord | null>;
  put(record: IdempotencyRecord): Promise<void>;
  /**
   * Atomically reserve a key before the operation runs.
   *
   * `get` then `put` has a window: two retries arriving together both see no
   * record, both run, and the booking happens twice. Claiming first closes it —
   * exactly one caller wins the reservation, and the other is told the
   * operation is already in flight.
   */
  claim(key: string, fingerprint: string): Promise<IdempotencyClaim>;
  /** Store the outcome of a claimed operation so later retries replay it. */
  complete(key: string, statusCode: number, responseBody: unknown): Promise<void>;
  /** Drop a claim whose operation failed, so the client may retry it. */
  release(key: string): Promise<void>;
}

export type IdempotencyClaim =
  | { readonly kind: 'claimed' }
  | { readonly kind: 'replay'; readonly record: IdempotencyRecord }
  | { readonly kind: 'in_progress' };

/**
 * A claim still in progress after this long is treated as abandoned — the
 * process that held it crashed — and may be taken over. Without a limit, a
 * crash mid-request would block that key for the full retention period.
 */
export const IDEMPOTENCY_CLAIM_STALE_MS = 2 * 60 * 1000;

/** `Idempotency-Key` header grammar: opaque, bounded, URL-safe. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export function idempotencyMismatch(key: string): AppError {
  return new AppError(
    ERROR_CODES.CONFLICT,
    'This idempotency key was already used for a different request. Use a new key for a new operation.',
    { details: { idempotencyKey: key } },
  );
}

export function fingerprintRequest(method: string, path: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method}:${path}:${JSON.stringify(body ?? null)}`)
    .digest('hex');
}

export type IdempotencyOutcome =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'replay'; readonly record: IdempotencyRecord };

export async function checkIdempotency(
  store: IdempotencyStore,
  key: string | null,
  fingerprint: string,
): Promise<IdempotencyOutcome> {
  if (!key) return { kind: 'proceed' };

  const existing = await store.get(key);
  if (!existing) return { kind: 'proceed' };

  if (existing.fingerprint !== fingerprint) throw idempotencyMismatch(key);

  return { kind: 'replay', record: existing };
}

/**
 * In-memory store for tests and a database-less local run. Per-process, so not
 * a production store — `DatabaseIdempotencyStore` is installed whenever a
 * database is configured.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async get(key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(key) ?? null;
  }

  async put(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, record);
  }

  async claim(key: string, fingerprint: string): Promise<IdempotencyClaim> {
    const existing = this.records.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw idempotencyMismatch(key);
      if (existing.statusCode !== 0) return { kind: 'replay', record: existing };
      if (Date.now() - existing.createdAt.getTime() < IDEMPOTENCY_CLAIM_STALE_MS) {
        return { kind: 'in_progress' };
      }
    }
    this.records.set(key, { key, fingerprint, statusCode: 0, responseBody: null, createdAt: new Date() });
    return { kind: 'claimed' };
  }

  async complete(key: string, statusCode: number, responseBody: unknown): Promise<void> {
    const existing = this.records.get(key);
    if (existing) this.records.set(key, { ...existing, statusCode, responseBody });
  }

  async release(key: string): Promise<void> {
    this.records.delete(key);
  }

  clear(): void {
    this.records.clear();
  }
}

export const defaultIdempotencyStore = new InMemoryIdempotencyStore();
