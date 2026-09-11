/**
 * TOOTHLOGY ROUTE HANDLER
 *
 * The single wrapper every API route uses. It exists so that the things which
 * must happen on every request cannot be forgotten on any request.
 *
 * Wrapping a handler applies, in order:
 *
 *   1. a request ID and a logger bound to it
 *   2. rate limiting
 *   3. feature-flag gating
 *   4. principal resolution
 *   5. authentication and permission checks   ← default deny
 *   6. input validation
 *   7. the handler itself
 *   8. error mapping to the shared envelope
 *   9. security headers
 *  10. an audit event for mutations
 *
 * Steps 4–5 are the reason this abstraction is not optional. In a codebase with
 * hundreds of routes, "remember to check permissions" is a rule that will be
 * broken, and a missing check looks exactly like a route that is intentionally
 * public. Here, permissions are a parameter of the route's *definition*: a route
 * declares `permissions: []` to be public, and there is no way to express
 * "forgot to think about it".
 */

import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { API_BY_ID } from '@/registry/apis';
import { getEnvironment, hasDatabase } from '../config';
import { AppError, ERROR_CODES, errors, toAppError } from '../kernel/errors';
import { newRequestId } from '../kernel/ids';
import { recordAuditEvent } from '../audit';
import { ensureBootstrapped } from '../bootstrap';
import { isFlagEnabled } from '../flags';
import { logger, type Logger, requestLogger } from '../observability/logger';
import { type Principal, ANONYMOUS, requirePermission } from '../rbac';
import { SESSION_COOKIE, resolveSession } from '../auth/session';
import { databaseIdempotencyStore, databaseRateLimitStore } from '../db/stores';
import { errorEnvelope, jsonSafe, successEnvelope } from './envelope';
import {
  IDEMPOTENCY_KEY_PATTERN,
  defaultIdempotencyStore,
  defaultRateLimitStore,
  enforceRateLimit,
  rateLimitKey,
  securityHeaders,
  type IdempotencyStore,
  type RateLimitStore,
} from './security';

/**
 * The rate-limit store in force.
 *
 * Database-backed when one is configured, in-memory otherwise. The in-memory
 * fallback is per-process and documented as unsuitable for production; it
 * exists only so the app runs standalone.
 */
function activeRateLimitStore(): RateLimitStore {
  return hasDatabase() ? databaseRateLimitStore : defaultRateLimitStore;
}

/**
 * Coalesced, in-process outbox relay after mutations.
 *
 * At most one relay runs per process at a time; a mutation arriving while one
 * is running asks for exactly one more pass afterwards. Skipped in tests,
 * which relay explicitly so their assertions are deterministic, and without a
 * database, where there is no outbox.
 */
let relayRunning = false;
let relayPending = false;

function scheduleInlineRelay(): void {
  if (getEnvironment() === 'test' || !hasDatabase() || process.env.TL_INLINE_RELAY === 'false') return;
  if (relayRunning) {
    relayPending = true;
    return;
  }
  relayRunning = true;
  setImmediate(() => {
    void import('../jobs')
      .then(({ runJobs }) => runJobs(['outbox.relay']))
      .catch((error: unknown) => logger.warn('Inline outbox relay failed', { error }))
      .finally(() => {
        relayRunning = false;
        if (relayPending) {
          relayPending = false;
          scheduleInlineRelay();
        }
      });
  });
}

/** Same reasoning as the rate-limit store: persistent whenever possible. */
function activeIdempotencyStore(): IdempotencyStore {
  return hasDatabase() ? databaseIdempotencyStore : defaultIdempotencyStore;
}

/**
 * Options for a response cookie.
 *
 * Defaults are the secure ones, so a caller has to opt *out* of safety rather
 * than remember to opt in: `httpOnly` keeps a session token away from any XSS
 * that reaches the page, `sameSite: 'lax'` blocks CSRF on state-changing
 * requests while still allowing normal top-level navigation into the app, and
 * `secure` is on outside development.
 */
export interface CookieOptions {
  readonly maxAgeSeconds?: number;
  readonly expires?: Date;
  readonly path?: string;
  readonly httpOnly?: boolean;
  readonly sameSite?: 'strict' | 'lax' | 'none';
  readonly secure?: boolean;
}

/** Everything a handler is given. */
export interface RequestContext<TBody = unknown> {
  readonly request: Request;
  readonly url: URL;
  readonly requestId: string;
  readonly logger: Logger;
  readonly principal: Principal;
  /** Parsed and validated body. `undefined` when the route declares no schema. */
  readonly body: TBody;
  readonly locale: string;
  /** Dynamic route segments, e.g. `{ id: 'org_01J…' }`. */
  readonly params: RouteParams;
  /** Client IP, from the proxy headers. Null when it cannot be determined. */
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  /** Queue a Set-Cookie header on the response. */
  readonly setCookie: (name: string, value: string, options?: CookieOptions) => void;
  /** Queue removal of a cookie. */
  readonly clearCookie: (name: string, options?: Pick<CookieOptions, 'path'>) => void;
}

/** Serialise one Set-Cookie header value. */
function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions,
  isProduction: boolean,
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly ?? true) parts.push('HttpOnly');
  parts.push(`SameSite=${capitalise(options.sameSite ?? 'lax')}`);
  // Secure is omitted in development so cookies work over plain-HTTP localhost.
  if (options.secure ?? isProduction) parts.push('Secure');

  return parts.join('; ');
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Dynamic route segment values, e.g. `{ id: 'org_01J…' }`. */
export type RouteParams = Record<string, string | string[] | undefined>;

export interface RouteDefinition<TBody = unknown, TResult = unknown> {
  /** Registry ID of this endpoint (`TL-API-…`), for logs and audit records. */
  readonly id: string;
  /**
   * Permissions required. `[]` means intentionally public — an explicit
   * decision, never an omission (Constitution §9).
   */
  readonly permissions: readonly string[];
  /**
   * Resolve the scope a permission is evaluated against.
   *
   * Organization-scoped permissions are meaningless without knowing WHICH
   * organization: `tl.core.organization.manage` checked globally always denies,
   * because nobody holds it globally. This resolver reads the organization id
   * from the route params or the body, so the check becomes "may this principal
   * manage THIS organization?" — which is the question that stops one clinic's
   * administrator from managing another clinic.
   *
   * Kept declarative rather than left to the handler so the check still runs
   * before any handler code, and cannot be forgotten.
   */
  readonly resolveScope?: (context: {
    params: RouteParams;
    body: TBody;
    url: URL;
  }) => { organizationId?: string; subjectUserId?: string };
  readonly authRequired: boolean;
  /** Named policy from RATE_LIMIT_POLICIES. */
  readonly rateLimit?: string;
  /** Feature flag gating this route. A disabled flag yields 404, not 403. */
  readonly flag?: string;
  /** Zod schema for the request body. Omit for routes without one. */
  readonly bodySchema?: ZodType<TBody>;
  /** Record an audit event on success. Default: true for mutations. */
  readonly audit?: boolean;
  readonly handler: (context: RequestContext<TBody>) => Promise<TResult> | TResult;
}

/**
 * Resolve the principal for a request.
 *
 * ✅ Phase 1: reads the session cookie and resolves it against the database.
 *
 * Returns `ANONYMOUS` for every failure — no cookie, unknown token, expired,
 * revoked, suspended or deleted user. The caller cannot distinguish these and
 * should not: with a principal that always exists and holds no permissions,
 * every route runs the same permission check and simply denies.
 *
 * With no database configured this stays anonymous rather than throwing, so
 * public pages still render on a standalone install.
 */
async function resolvePrincipal(request: Request): Promise<Principal> {
  if (!hasDatabase()) return ANONYMOUS;

  const token = readSessionCookie(request);
  if (!token) return ANONYMOUS;

  try {
    return await resolveSession(token);
  } catch (error) {
    // A database blip must not turn every authenticated request into a 500.
    // Degrading to anonymous fails closed: the caller gets 401, not access.
    logger.error('Session resolution failed', { error });
    return ANONYMOUS;
  }
}

/**
 * Read the session token from the Cookie header.
 *
 * Parsed from the raw header rather than via `next/headers` so this function
 * works identically in a route handler and in a test that constructs a plain
 * `Request`.
 */
function readSessionCookie(request: Request): string | null {
  return readCookie(request, SESSION_COOKIE);
}

/** Read one cookie from the raw Cookie header. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim()) || null;
  }
  return null;
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip');
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Wrap a route definition into a Next.js route handler.
 *
 * Returns a function matching the App Router's Route Handler signature.
 */
export function defineRoute<TBody = undefined, TResult = unknown>(
  definition: RouteDefinition<TBody, TResult>,
) {
  /**
   * Matches Next.js's Route Handler signature. The second argument carries
   * dynamic segments and is a Promise in the App Router, so it is awaited
   * rather than read directly.
   */
  return async function routeHandler(
    request: Request,
    routeContext?: { params?: Promise<RouteParams> | RouteParams },
  ): Promise<Response> {
    const requestId = newRequestId();
    const url = new URL(request.url);
    const log = requestLogger(requestId, {
      route: definition.id,
      method: request.method,
      path: url.pathname,
    });

    const isProduction = getEnvironment() === 'production';
    const headers = securityHeaders(isProduction);
    const started = Date.now();

    // Cookies queued by the handler, applied to whichever response is returned.
    const pendingCookies: string[] = [];
    const setCookie = (name: string, value: string, options: CookieOptions = {}) => {
      pendingCookies.push(serializeCookie(name, value, options, isProduction));
    };
    const clearCookie = (name: string, options: Pick<CookieOptions, 'path'> = {}) => {
      pendingCookies.push(
        serializeCookie(name, '', { ...options, maxAgeSeconds: 0 }, isProduction),
      );
    };

    /** Attach queued Set-Cookie headers to a response. */
    const applyCookies = <T extends Response>(response: T): T => {
      for (const cookie of pendingCookies) response.headers.append('Set-Cookie', cookie);
      return response;
    };

    let principal: Principal = ANONYMOUS;
    /** Scoped idempotency key claimed by this request, released if it fails. */
    let idempotencyKey: string | null = null;

    try {
      // 0. Install persistent stores on first request. Idempotent and cheap.
      ensureBootstrapped();

      // 1. Feature flag. Checked before anything else so a disabled route is
      //    indistinguishable from a nonexistent one and reveals nothing.
      if (definition.flag && !isFlagEnabled(definition.flag)) {
        throw errors.featureDisabled(definition.flag);
      }

      // 2. Principal.
      principal = await resolvePrincipal(request);

      // 3. Rate limit — keyed by user when known, IP otherwise.
      if (definition.rateLimit) {
        const key = rateLimitKey(
          principal.kind === 'user' ? principal.userId : null,
          clientIp(request),
        );
        await enforceRateLimit(activeRateLimitStore(), key, definition.rateLimit);
      }

      // 4. Authentication.
      if (definition.authRequired && principal.kind === 'anonymous') {
        throw errors.unauthenticated();
      }

      // The raw body is read once, here, because the idempotency fingerprint
      // and the schema both need it. Routes without a schema (multipart
      // uploads) keep their body stream untouched for `request.formData()`.
      const rawBody = definition.bodySchema ? await request.text() : null;

      // 4b. Idempotency. Applied to every mutating route the API registry
      //     declares idempotent — the registry claim and the behaviour are one
      //     fact, so a route cannot say "idempotent" and be replay-unsafe. The
      //     key is scoped to the route and the caller, so one user's key can
      //     never replay another user's response.
      if (MUTATING.has(request.method) && API_BY_ID.get(definition.id)?.idempotent) {
        const header = request.headers.get('idempotency-key');
        if (header) {
          if (!IDEMPOTENCY_KEY_PATTERN.test(header)) {
            throw errors.validation('Idempotency-Key must be 8–128 URL-safe characters.', {
              field: 'Idempotency-Key',
            });
          }
          const caller =
            principal.kind === 'user' ? principal.userId : `ip:${clientIp(request) ?? 'unknown'}`;
          const scopedKey = `${definition.id}:${caller}:${header}`;
          const fingerprint = createHash('sha256')
            .update(
              `${request.method}:${url.pathname}${url.search}:${rawBody ?? request.headers.get('content-length') ?? ''}`,
            )
            .digest('hex');

          const claim = await activeIdempotencyStore().claim(scopedKey, fingerprint);
          if (claim.kind === 'replay') {
            log.info('Idempotent replay', { status: claim.record.statusCode });
            return NextResponse.json(claim.record.responseBody, {
              status: claim.record.statusCode,
              headers: { ...headers, 'Idempotent-Replayed': 'true' },
            });
          }
          if (claim.kind === 'in_progress') {
            throw errors.conflict(
              'A request with this Idempotency-Key is still being processed. Retry shortly.',
            );
          }
          idempotencyKey = scopedKey;
        }
      }

      // 5. Body validation. Runs before the permission check because a scoped
      //    permission may need an id carried in the body.
      let body = undefined as TBody;
      if (definition.bodySchema) {
        body = parseBody(rawBody ?? '', definition.bodySchema);
      }

      const params = (await routeContext?.params) ?? {};

      // 6. Authorization. Default deny, evaluated against the resolved scope so
      //    an organization permission asks "may they manage THIS one?".
      const scope = definition.resolveScope?.({ params, body, url }) ?? {};
      for (const permission of definition.permissions) {
        requirePermission(principal, permission, scope);
      }

      // 7. The handler.
      const result = await definition.handler({
        request,
        url,
        requestId,
        logger: log,
        principal,
        body,
        params,
        locale: url.searchParams.get('locale') ?? 'en',
        ipAddress: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        setCookie,
        clearCookie,
      });

      // 7. Audit. Mutations are audited by default (Constitution §9).
      const shouldAudit = definition.audit ?? MUTATING.has(request.method);
      if (shouldAudit) {
        await recordAuditEvent({
          action: definition.id,
          actor: principal.kind === 'user' ? principal.userId : principal.kind,
          subject: url.pathname,
          outcome: 'success',
          requestId,
        });
      }

      // A handler may return a raw Response — binary downloads are not JSON.
      // It still gets every protection above (flag, auth, permission, rate
      // limit, audit) and the security headers; only the envelope is skipped.
      if (result instanceof Response) {
        for (const [name, value] of Object.entries(headers)) {
          if (!result.headers.has(name)) result.headers.set(name, value);
        }
        log.info('Request completed', { status: result.status, durationMs: Date.now() - started, raw: true });
        return applyCookies(result);
      }

      log.info('Request completed', { status: 200, durationMs: Date.now() - started });

      // A committed mutation may have written outbox events. Relay them now
      // rather than waiting for the scheduler, so a welcome message or an
      // appointment confirmation arrives within seconds. Fire-and-forget: the
      // response never waits on it, and the scheduled job remains the
      // guarantee if this process dies first.
      if (MUTATING.has(request.method)) scheduleInlineRelay();

      const envelope = successEnvelope(jsonSafe(result), requestId);
      if (idempotencyKey) {
        // A failure to store the outcome must not turn a completed operation
        // into an error response: the work is done. The claim then expires as
        // abandoned, and a retry after that re-runs — which the business layer
        // (unique constraints, state machines) must also tolerate.
        await activeIdempotencyStore()
          .complete(idempotencyKey, 200, envelope)
          .catch((storeError: unknown) =>
            log.error('Failed to store idempotent result', { error: storeError }),
          );
      }

      return applyCookies(NextResponse.json(envelope, { status: 200, headers }));
    } catch (error) {
      const { envelope, appError } = errorEnvelope(error, requestId);

      // A failed operation releases its key, so the client can retry it. Only
      // successes are replayed: replaying a transient 503 would turn a blip
      // into a permanent failure for that key.
      if (idempotencyKey) {
        await activeIdempotencyStore()
          .release(idempotencyKey)
          .catch(() => {});
      }

      // Client mistakes are warnings; server failures are errors. Logging a 404
      // at error level is how alerting becomes noise nobody reads.
      const level = appError.status >= 500 ? 'error' : 'warn';
      log[level]('Request failed', {
        status: appError.status,
        errorCode: appError.code,
        durationMs: Date.now() - started,
        // The full error, including `cause`, goes to the log and never to the
        // client. The logger redacts sensitive fields inside it.
        error: appError,
      });

      if (MUTATING.has(request.method)) {
        await recordAuditEvent({
          action: definition.id,
          actor: principal.kind === 'user' ? principal.userId : principal.kind,
          subject: url.pathname,
          outcome: 'failure',
          requestId,
          detail: { errorCode: appError.code },
        });
      }

      const responseHeaders = { ...headers };
      if (appError.code === ERROR_CODES.RATE_LIMITED) {
        const retryAfter = (appError.details as { retryAfterSeconds?: number } | undefined)
          ?.retryAfterSeconds;
        if (retryAfter) responseHeaders['Retry-After'] = String(retryAfter);
      }

      // Cookies are applied to error responses too: logout must clear the
      // session cookie even if the audit write that follows it fails.
      return applyCookies(
        NextResponse.json(envelope, { status: appError.status, headers: responseHeaders }),
      );
    }
  };
}

/**
 * Parse and validate a JSON body.
 *
 * Validation failures return the field paths, so a client gets an actionable
 * error instead of "invalid request". Zod messages are safe to expose — they
 * describe the caller's own input, not our internals.
 */
function parseBody<T>(text: string, schema: ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Request body must be valid JSON.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Request validation failed.', {
      details: {
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      },
    });
  }

  return parsed.data;
}

/** Wrap a thrown error into an envelope response outside `defineRoute`. */
export function errorResponse(error: unknown, requestId: string = newRequestId()): NextResponse {
  const { envelope, appError } = errorEnvelope(error, requestId);
  return NextResponse.json(envelope, {
    status: toAppError(appError).status,
    headers: securityHeaders(getEnvironment() === 'production'),
  });
}
