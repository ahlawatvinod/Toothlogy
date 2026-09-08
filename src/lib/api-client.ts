/**
 * TOOTHLOGY BROWSER API CLIENT
 *
 * The one place the browser talks to the API.
 *
 * WHY A CLIENT RATHER THAN BARE `fetch` CALLS
 * Every response shares the same envelope (`{ ok, data | error, meta }`), so
 * unwrapping it belongs in one place. Scattered `fetch` calls each
 * re-implement "did this work?", and the one that gets it wrong shows a success
 * toast for a failed request.
 *
 * It also means every form gets, for free:
 *  - the request id from `meta`, which turns a user's "it broke" into a log line
 *  - field-level validation errors mapped back onto the inputs that caused them
 *  - a typed discriminated result, so a caller cannot read `data` without first
 *    checking `ok`
 */

/** Field errors keyed by form field name, as returned by the API. */
export type FieldErrors = Readonly<Record<string, string>>;

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T; readonly requestId: string }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly fieldErrors: FieldErrors;
      readonly requestId: string;
    };

interface ErrorPayload {
  code?: string;
  message?: string;
  details?: {
    issues?: Array<{ field?: string; message?: string }>;
    field?: string;
  };
}

/**
 * Map an API error's `details` onto form fields.
 *
 * The server returns issues as `{ field, message }`; forms need
 * `{ fieldName: message }`. Doing it here means every form displays validation
 * errors next to the offending input rather than as one opaque banner.
 */
function extractFieldErrors(error: ErrorPayload | undefined): FieldErrors {
  const out: Record<string, string> = {};
  if (!error?.details) return out;

  for (const issue of error.details.issues ?? []) {
    if (issue.field && issue.message && !out[issue.field]) out[issue.field] = issue.message;
  }

  // Some errors name a single field directly rather than listing issues.
  if (error.details.field && error.message && !out[error.details.field]) {
    out[error.details.field] = error.message;
  }

  return out;
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...rest.headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      // Session cookies must travel with every request.
      credentials: 'same-origin',
    });
  } catch {
    // Network failure: there is no envelope and no request id, because the
    // request never reached the server. Reported as such rather than as a
    // generic error, because the user's recovery action is different — check
    // your connection, not contact support.
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Could not reach Toothlogy. Check your connection and try again.',
      fieldErrors: {},
      requestId: '',
    };
  }

  let payload: { ok?: boolean; data?: T; error?: ErrorPayload; meta?: { requestId?: string } };
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: 'INVALID_RESPONSE',
      message: 'The server returned an unexpected response.',
      fieldErrors: {},
      requestId: '',
    };
  }

  const requestId = payload.meta?.requestId ?? '';

  if (payload.ok === true) {
    return { ok: true, data: payload.data as T, requestId };
  }

  return {
    ok: false,
    code: payload.error?.code ?? 'UNKNOWN',
    message: payload.error?.message ?? 'Something went wrong.',
    fieldErrors: extractFieldErrors(payload.error),
    requestId,
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PUT', json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
