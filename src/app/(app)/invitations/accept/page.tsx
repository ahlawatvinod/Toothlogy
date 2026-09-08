/**
 * TL-PAGE-INVITEACCEPT-001 — /invitations/accept
 */

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoadingState } from '@/design-system';
import { AcceptInvitationClient } from './accept-client';

export const metadata: Metadata = {
  title: 'Accept invitation',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AcceptInvitationPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '36rem' }}>
      <header className="tl-page__header">
        <h1>Join an organization</h1>
      </header>
      <Suspense fallback={<LoadingState label="Loading invitation…" />}>
        <AcceptInvitationClient />
      </Suspense>
    </div>
  );
}
