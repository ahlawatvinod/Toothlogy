/**
 * Root error boundary.
 *
 * Catches render errors anywhere below the root layout. Two decisions:
 *
 * - **The error message is never shown.** `error.message` from a server
 *   component can contain internal detail; Next.js redacts it in production,
 *   but relying on the framework to redact is weaker than not rendering it.
 * - **The digest is shown.** It is a hash that correlates this failure with the
 *   server log entry, which turns "the site broke" into a findable record
 *   (founding spec §22).
 */

'use client';

import { useEffect } from 'react';
import { Button, ErrorState } from '@/design-system';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Reaches the browser console and, once an adapter is configured, the error
    // tracking provider. The structured server log already has the full error.
    console.error('Unhandled application error', { digest: error.digest });
  }, [error]);

  return (
    <main className="tl-container" style={{ paddingBlock: 'var(--tl-space-8)' }}>
      <ErrorState
        title="Something went wrong"
        description="This page could not be displayed. The problem has been recorded."
        requestId={error.digest}
        action={
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
