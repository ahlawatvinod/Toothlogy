/**
 * TL-PAGE-SECURITY-001 — /account/security
 *
 * Sessions are loaded HERE, on the server, and passed to the client component.
 *
 * The earlier version fetched them from the browser on mount. Server-loading is
 * better on every axis: no loading spinner, no request waterfall after
 * hydration, and one fewer round trip on a page a worried user is reading in a
 * hurry. After a revoke or a password change the client calls
 * `router.refresh()`, which re-runs this server component — so there is exactly
 * one place that knows how to read sessions.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listSessions } from '@/platform/auth/session';
import { SecurityClient } from './security-client';

export const metadata: Metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login');

  const sessions = await listSessions(principal.userId, principal.sessionId);

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account">Account</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Security</span>
      </nav>

      <header className="tl-page__header">
        <h1>Security</h1>
        <p className="tl-page__lead">
          Review where you are signed in, and change your password.
        </p>
      </header>

      <SecurityClient
        sessions={sessions.map((s) => ({
          id: s.id,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          lastActiveAt: s.lastActiveAt.toISOString(),
          isCurrent: s.isCurrent,
        }))}
      />
    </div>
  );
}
