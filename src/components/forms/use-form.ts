/**
 * TOOTHLOGY FORM STATE
 *
 * A small form hook, written here rather than pulled in as a dependency,
 * because what Toothlogy forms actually need is narrow and specific:
 *
 * - **Server errors mapped back onto fields.** The server is the authority on
 *   validation (client checks can be bypassed), so its field errors must land
 *   next to the inputs that caused them, not in a banner.
 * - **The request id kept on failure.** Every error state shows it, which turns
 *   a user's "it didn't work" into an exact log line.
 * - **Errors cleared as the user types.** An error that persists while the user
 *   fixes it reads as "still wrong", and they stop trusting the messages.
 * - **Double submission blocked.** Without it, a double-tap on a slow
 *   connection creates two accounts, or two bookings.
 *
 * Client-side validation here is a convenience that gives fast feedback. It is
 * never the security boundary — the server validates every field again.
 */

'use client';

import { useCallback, useState } from 'react';
import type { ApiResult, FieldErrors } from '@/lib/api-client';

export interface FormState<TValues> {
  readonly values: TValues;
  readonly fieldErrors: FieldErrors;
  readonly formError: string | null;
  readonly requestId: string | null;
  readonly submitting: boolean;
  readonly succeeded: boolean;
}

export interface UseFormOptions<TValues, TResult> {
  readonly initialValues: TValues;
  /** Client-side checks. Fast feedback only; the server re-validates. */
  readonly validate?: (values: TValues) => FieldErrors;
  readonly submit: (values: TValues) => Promise<ApiResult<TResult>>;
  readonly onSuccess?: (data: TResult) => void | Promise<void>;
}

export function useForm<TValues extends Record<string, unknown>, TResult>(
  options: UseFormOptions<TValues, TResult>,
) {
  const [values, setValues] = useState<TValues>(options.initialValues);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const setValue = useCallback(<K extends keyof TValues>(name: K, value: TValues[K]) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear this field's error as the user corrects it. Leaving it visible
    // while they type reads as "still wrong" and erodes trust in the messages.
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name as string];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (event?: { preventDefault: () => void }) => {
      event?.preventDefault();
      // Guard against a double-tap on a slow connection creating two accounts.
      if (submitting) return;

      setFormError(null);
      setRequestId(null);

      const clientErrors = options.validate?.(values) ?? {};
      if (Object.keys(clientErrors).length > 0) {
        setFieldErrors(clientErrors);
        return;
      }

      setSubmitting(true);
      const result = await options.submit(values);
      setSubmitting(false);

      if (result.ok) {
        setFieldErrors({});
        setSucceeded(true);
        await options.onSuccess?.(result.data);
        return;
      }

      setFieldErrors(result.fieldErrors);
      // Only show a form-level banner when no field owns the error; otherwise
      // the user sees the same message twice.
      setFormError(Object.keys(result.fieldErrors).length > 0 ? null : result.message);
      setRequestId(result.requestId || null);
    },
    [options, submitting, values],
  );

  return {
    values,
    setValue,
    fieldErrors,
    formError,
    requestId,
    submitting,
    succeeded,
    handleSubmit,
    reset: () => {
      setValues(options.initialValues);
      setFieldErrors({});
      setFormError(null);
      setSucceeded(false);
    },
  };
}
