/**
 * TOOTHLOGY ERROR TAXONOMY
 *
 * One error type, one closed set of codes, one mapping to HTTP status. Every
 * division uses it (Constitution P7).
 *
 * The design solves a specific failure mode. In a large codebase, errors thrown
 * deep in a service reach the HTTP boundary as bare `Error`s, and the boundary
 * has no safe choice: return the message and risk leaking internals, or return
 * "something went wrong" and make the API useless. `AppError` removes the
 * dilemma — an error that reached the boundary deliberately carries a
 * client-safe message, and anything else is treated as internal and scrubbed.
 *
 * Three properties matter:
 *
 * - **`expose`** decides whether the message may be sent to a client. Only
 *   errors constructed here as expected conditions set it. An unexpected
 *   exception is never exposed (Constitution §9).
 * - **`cause`** keeps the original error for logs without it ever reaching the
 *   client.
 * - **`details`** carries structured, client-safe context — which field failed
 *   validation, which permission was missing.
 */

/**
 * The closed set of error codes. Adding one is a deliberate API change: clients
 * branch on these strings, so they are as much a contract as the URL is.
 */
export const ERROR_CODES = {
  /** Input failed schema validation. `details` names the offending fields. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** No authenticated principal, or the session is expired or revoked. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Authenticated, but the principal lacks the required permission. */
  FORBIDDEN: 'FORBIDDEN',
  /** The resource does not exist, or the caller may not know that it does. */
  NOT_FOUND: 'NOT_FOUND',
  /** The request conflicts with current state — a duplicate, or a lost update. */
  CONFLICT: 'CONFLICT',
  /** The request is well-formed but not allowed in the current state. */
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  /** Too many requests. Retry after the interval in `details.retryAfterSeconds`. */
  RATE_LIMITED: 'RATE_LIMITED',
  /**
   * An integration is not configured. Returned instead of a fabricated success
   * so an unwired provider fails loudly and locally (Constitution P10).
   */
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  /** A downstream provider failed or timed out. */
  UPSTREAM_FAILED: 'UPSTREAM_FAILED',
  /** The capability exists but is switched off by a feature flag. */
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  /** Requested but not built yet. Distinct from NOT_FOUND, which means "no such thing". */
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  /** Anything unexpected. Never exposes its message. */
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  RATE_LIMITED: 429,
  NOT_CONFIGURED: 503,
  UPSTREAM_FAILED: 502,
  FEATURE_DISABLED: 404,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};

/**
 * `FEATURE_DISABLED` maps to 404 rather than 403 on purpose: a disabled feature
 * should be indistinguishable from a route that does not exist, so flag state
 * cannot be probed from outside to discover unreleased capabilities.
 */
export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

export interface ErrorDetails {
  readonly [key: string]: unknown;
}

export interface AppErrorOptions {
  readonly details?: ErrorDetails;
  readonly cause?: unknown;
  /** Override exposure. Defaults to true for every code except INTERNAL. */
  readonly expose?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ErrorDetails;
  readonly expose: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = statusForCode(code);
    this.details = options.details;
    this.expose = options.expose ?? code !== ERROR_CODES.INTERNAL;
    Error.captureStackTrace?.(this, AppError);
  }

  /** The client-safe projection. Never includes `cause` or a stack. */
  toPublicJSON(): { code: ErrorCode; message: string; details?: ErrorDetails } {
    return {
      code: this.code,
      message: this.expose ? this.message : 'An unexpected error occurred.',
      ...(this.expose && this.details ? { details: this.details } : {}),
    };
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Coerce anything thrown into an `AppError`.
 *
 * The boundary between "errors we designed" and "errors that escaped". Anything
 * that is not already an `AppError` becomes a non-exposed `INTERNAL`, so an
 * unexpected exception can never leak a message, a stack, or a database error
 * string to a client — while the original is preserved as `cause` for the log.
 */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return new AppError(ERROR_CODES.INTERNAL, message, { cause: value, expose: false });
}

// --- Constructors for the common cases -------------------------------------
// Named constructors, rather than `new AppError(...)` at call sites, so the
// message style and details shape stay consistent across 35 divisions.

export const errors = {
  validation: (message: string, details?: ErrorDetails) =>
    new AppError(ERROR_CODES.VALIDATION_FAILED, message, { details }),

  unauthenticated: (message = 'Authentication is required.') =>
    new AppError(ERROR_CODES.UNAUTHENTICATED, message),

  /**
   * The missing permission is included deliberately: it is not a secret, and
   * naming it turns an opaque 403 into something an integrator can act on.
   */
  forbidden: (permission?: string) =>
    new AppError(
      ERROR_CODES.FORBIDDEN,
      permission
        ? `You do not have permission to perform this action (${permission}).`
        : 'You do not have permission to perform this action.',
      { details: permission ? { requiredPermission: permission } : undefined },
    ),

  notFound: (resource = 'Resource') =>
    new AppError(ERROR_CODES.NOT_FOUND, `${resource} was not found.`),

  conflict: (message: string, details?: ErrorDetails) =>
    new AppError(ERROR_CODES.CONFLICT, message, { details }),

  preconditionFailed: (message: string, details?: ErrorDetails) =>
    new AppError(ERROR_CODES.PRECONDITION_FAILED, message, { details }),

  rateLimited: (retryAfterSeconds: number) =>
    new AppError(ERROR_CODES.RATE_LIMITED, 'Too many requests. Please retry shortly.', {
      details: { retryAfterSeconds },
    }),

  /**
   * The Constitution P10 error. An integration with no configured provider
   * returns this — it never returns a synthetic success.
   */
  notConfigured: (integration: string) =>
    new AppError(
      ERROR_CODES.NOT_CONFIGURED,
      `The ${integration} integration is not configured in this environment.`,
      { details: { integration } },
    ),

  upstreamFailed: (provider: string, cause?: unknown) =>
    new AppError(ERROR_CODES.UPSTREAM_FAILED, `The ${provider} provider failed to respond.`, {
      details: { provider },
      cause,
    }),

  featureDisabled: (flagKey: string) =>
    new AppError(ERROR_CODES.FEATURE_DISABLED, 'Not found.', {
      details: undefined,
      // The flag key is recorded for logs but never exposed, so flag state
      // cannot be enumerated by probing endpoints.
      cause: `feature flag '${flagKey}' is not enabled`,
    }),

  notImplemented: (what: string) =>
    new AppError(ERROR_CODES.NOT_IMPLEMENTED, `${what} is not implemented yet.`),

  internal: (message: string, cause?: unknown) =>
    new AppError(ERROR_CODES.INTERNAL, message, { cause, expose: false }),
};
