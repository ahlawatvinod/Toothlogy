/**
 * TL-PAGE-PRACTICE-MESSAGES-001 — /account/practice/messages
 *
 * Patients' conversations with each practice the person may read messages
 * for: open first, newest activity first, unread marked.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPracticeThreads, READ } from '@/platform/messaging/service';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Practice messages', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PracticeMessagesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice/messages');
  const orgIds = principal.organizations.map((o) => o.organizationId).filter((organizationId) => can(principal, READ, { organizationId }));
  const organizations = await db().organization.findMany({ where: { id: { in: orgIds }, deletedAt: null }, select: { id: true, name: true } });
  const inboxes = await Promise.all(organizations.map(async (o) => ({ organization: o, threads: await listPracticeThreads(principal, o.id) })));
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Messages</span>
      </nav>
      <header className="tl-page__header">
        <h1>Messages</h1>
        <p className="tl-page__lead">Patients write to you here about their appointments. Only people at your practice who may read messages see them.</p>
      </header>
      {inboxes.length === 0 ? <EmptyState title="No practice inbox" description="Messages appear for practices whose messages you may read." /> : null}
      {inboxes.map(({ organization, threads }) => (
        <Card key={organization.id} label={organization.name}>
          <CardHeader>
            <strong>{organization.name}</strong>
          </CardHeader>
          <CardBody>
            {threads.length === 0 ? (
              <p className="tl-muted" style={{ margin: 0 }}>No conversations yet.</p>
            ) : (
              <ul className="tl-list" aria-label={`Conversations for ${organization.name}`}>
                {threads.map((t) => (
                  <li key={t.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/account/practice/messages/${t.id}`}>
                        <strong>{t.subject}</strong>
                      </Link>
                      {t.unread ? <Badge tone="info">new</Badge> : null}
                      {t.status === 'CLOSED' ? <Badge tone="neutral">closed</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {t.patient} · {when(t.lastMessageAt)}
                      {t.last ? ` · ${t.last.side === 'PRACTICE' ? 'You: ' : ''}${t.last.text}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
