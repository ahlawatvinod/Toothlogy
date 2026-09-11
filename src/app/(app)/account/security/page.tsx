/**
 * TL-PAGE-SECURITY-001 — /account/security
 *
 * Everything a worried user needs on one screen, in the order they need it:
 * recent security activity (was that me?), the devices signed in (end the one
 * I don't recognise), the password, and two-step verification.
 *
 * Loaded on the server and passed to client components; after a change the
 * client calls `router.refresh()`, which re-runs this component — one place
 * that knows how to read each of these.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listSessions } from '@/platform/auth/session';
import { mfaStatus } from '@/platform/auth/mfa';
import { listSecurityEvents } from '@/platform/auth/security-events';
import { db } from '@/platform/db/client';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { SecurityClient } from './security-client';
import { MfaPanel } from './mfa-panel';

export const metadata: Metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/security');

  const [sessions, mfa, events, user] = await Promise.all([
    listSessions(principal.userId, principal.sessionId),
    mfaStatus(principal.userId),
    listSecurityEvents(principal.userId, 15),
    db().user.findUnique({ where: { id: principal.userId }, select: { timezone: true, locale: true } }),
  ]);

  const format = (d: Date) =>
    new Intl.DateTimeFormat(user?.locale ?? 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: user?.timezone ?? 'Asia/Kolkata',
    }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Security</h1>
        <p className="tl-page__lead">
          Check recent activity, end sessions you don’t recognise, and protect your account with two-step
          verification.
        </p>
      </header>

      <Card label="Recent security activity">
        <CardHeader>
          <strong>Recent activity</strong>
        </CardHeader>
        <CardBody>
          {events.length === 0 ? (
            <EmptyState title="Nothing to report" description="Sign-ins from new devices and security changes will appear here." />
          ) : (
            <ul className="tl-list">
              {events.map((e) => (
                <li key={e.id}>
                  <strong>{e.description}</strong>
                  <span className="tl-list__meta">
                    {format(e.occurredAt)}
                    {e.ipAddress ? ` · network ${e.ipAddress}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <MfaPanel
        status={{
          enabled: mfa.enabled,
          enabledAt: mfa.enabledAt ? format(mfa.enabledAt) : null,
          recoveryCodesRemaining: mfa.recoveryCodesRemaining,
        }}
      />

      <SecurityClient
        sessions={sessions.map((s) => ({
          id: s.id,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          lastActiveAt: s.lastActiveAt.toISOString(),
          lastActiveLabel: format(s.lastActiveAt),
          isCurrent: s.isCurrent,
        }))}
      />
    </div>
  );
}
