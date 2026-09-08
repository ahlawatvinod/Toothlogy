/**
 * Accept an organization invitation.
 *
 * Requires a signed-in account, because joining an organization has to attach
 * to one. The `(app)` layout enforces that and preserves the invitation link in
 * `next`, so a user who is signed out lands back here after signing in rather
 * than losing the invitation entirely.
 *
 * Unlike verification, this is NOT automatic on load. Joining an organization
 * grants a role and exposes that organization's data — a deliberate act that
 * deserves a deliberate click, and one the user can decline.
 */

'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Card, CardBody } from '@/design-system';
import { api } from '@/lib/api-client';

export function AcceptInvitationClient() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string } | null>(null);

  if (!token) {
    return (
      <Alert tone="danger" title="This link is incomplete">
        The invitation link is missing its token. Ask whoever invited you to send it again.
      </Alert>
    );
  }

  return (
    <Card label="Accept invitation">
      <CardBody>
        <p>
          You have been invited to join an organization on Toothlogy. Accepting will add your
          account as a member and grant you the role you were invited with.
        </p>

        {error ? (
          <Alert tone="danger" title="Could not accept the invitation">
            {error.message}
            {error.requestId ? (
              <>
                {' '}
                <span className="tl-form__reference">Reference: {error.requestId}</span>
              </>
            ) : null}
          </Alert>
        ) : null}

        <div className="tl-hero__actions" style={{ marginBlockStart: 'var(--tl-space-4)' }}>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);

              const result = await api.post<{ organizationId: string }>(
                '/api/v1/invitations/accept',
                { token },
              );

              setBusy(false);

              if (result.ok) {
                router.push(`/account/organizations/${result.data.organizationId}`);
                router.refresh();
              } else {
                setError({ message: result.message, requestId: result.requestId });
              }
            }}
          >
            Accept invitation
          </Button>

          {/* Declining must be possible, and must not be a dead end. */}
          <Link className="tl-button tl-button--secondary tl-button--md" href="/account">
            Not now
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
