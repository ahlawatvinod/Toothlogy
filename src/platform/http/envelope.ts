/**
 * TOOTHLOGY API RESPONSE ENVELOPE
 *
 * Founding spec §12: future modules consume shared API conventions rather than
 * inventing their own.
 *
 * Every response — success or failure — has the same top-level shape:
 *
 *     { "ok": true,  "data": …, "meta": { requestId, timestamp } }
 *     { "ok": false, "error": { code, message, details? }, "meta": { … } }
 *
 * The single `ok` discriminant is what makes a generic client possible: one
 * place to check for failure, one place to surface an error, one place to read
 * a request ID. Without it every consumer re-implements "did this work?" against
 * a slightly different shape per endpoint.
 *
 * `meta.requestId` is on *every* response, including errors. When a user reports
 * a problem, that ID is what turns "it broke this morning" into the exact log
 * line (founding spec §22).
 */

import type { ErrorCode } from '../kernel/errors';
import { AppError, toAppError } from '../kernel/errors';

export interface ResponseMeta {
  readonly requestId: string;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  readonly ok: true;
  readonly data: T;
  readonly meta: ResponseMeta;
}

export interface ErrorEnvelope {
  readonly ok: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
  readonly meta: ResponseMeta;
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function successEnvelope<T>(
  data: T,
  requestId: string,
  extraMeta: Readonly<Record<string, unknown>> = {},
): SuccessEnvelope<T> {
  return {
    ok: true,
    data,
    meta: { requestId, timestamp: new Date().toISOString(), ...extraMeta },
  };
}

/**
 * Build an error envelope from anything thrown.
 *
 * Routes the value through `toAppError`, so an unexpected exception becomes a
 * non-exposed INTERNAL error and its message never reaches the client
 * (Constitution §9). The original is preserved for the logger separately.
 */
export function errorEnvelope(
  error: unknown,
  requestId: string,
  extraMeta: Readonly<Record<string, unknown>> = {},
): { envelope: ErrorEnvelope; appError: AppError } {
  const appError = toAppError(error);
  return {
    appError,
    envelope: {
      ok: false,
      error: appError.toPublicJSON(),
      meta: { requestId, timestamp: new Date().toISOString(), ...extraMeta },
    },
  };
}

/**
 * Serialise values JSON cannot represent.
 *
 * `bigint` is the one that matters: money amounts are bigints (Constitution §4),
 * and `JSON.stringify` throws on them. Without this, every endpoint returning a
 * price would crash at serialisation time.
 */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = jsonSafe(v);
    return out;
  }
  return value;
}
