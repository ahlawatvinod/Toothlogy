/**
 * Email / phone verification landing page.
 *
 * Verification runs automatically on load rather than behind a "Verify" button:
 * the user already expressed intent by clicking the link in their email, and a
 * second confirmation click is a step that exists only for the implementation.
 *
 * `hasRun` guards against React's development double-invocation of effects,
 * which would otherwise fire two requests — the second failing with
 * "already used" because the first consumed the single-use token, and showing
 * the user an error for a verification that actually succeeded.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, LoadingState } from '@/design-system';
import { api } from '@/lib/api-client';

type Status =
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'failed'; message: string; requestId: string };

export function VerifyClient() {
  const token = useSearchParams().get('token') ?? '';

  /*
   * A missing token is known at render time, so it becomes the INITIAL state
   * rather than something an effect sets. Setting it in an effect would render
   * "verifying…" for one frame before flipping to an error, and would be a
   * cascading render for a value that never needed to be computed
   * asynchronously.
   */
  const [status, setStatus] = useState<Status>(() =>
    token
      ? { kind: 'working' }
      : {
          kind: 'failed',
          message: 'The verification link is missing its token.',
          requestId: '',
        },
  );
  const hasRun = useRef(false);

  useEffect(() => {
    if (!token || hasRun.current) return;
    hasRun.current = true;

    void (async () => {
      const result = await api.post('/api/v1/auth/verify', {
        token,
        type: 'EMAIL_VERIFICATION',
      });

      setStatus(
        result.ok
          ? { kind: 'done' }
          : { kind: 'failed', message: result.message, requestId: result.requestId },
      );
    })();
  }, [token]);

  if (status.kind === 'working') {
    return <LoadingState label="Verifying your email address…" />;
  }

  if (status.kind === 'done') {
    return (
      <div className="tl-stack">
        <Alert tone="success" title="Email verified">
          Thank you. Appointment confirmations and reminders can now reach you.
        </Alert>
        <Link className="tl-button tl-button--primary tl-button--md" href="/account">
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <div className="tl-stack">
      <Alert tone="danger" title="Could not verify">
        {status.message}
        {status.requestId ? (
          <>
            {' '}
            <span className="tl-form__reference">Reference: {status.requestId}</span>
          </>
        ) : null}
      </Alert>
      {/* A dead end would leave the user stuck; the recovery path is explicit. */}
      <Link className="tl-button tl-button--secondary tl-button--md" href="/account">
        Go to your account
      </Link>
    </div>
  );
}
