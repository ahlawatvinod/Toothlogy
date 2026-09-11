/**
 * TL-PAGE-MY-MESSAGES-001 — /account/messages
 *
 * The patient's conversations with practices, unread first by recency, and
 * a new message to a practice they have an appointment with.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listPatientThreads, messageablePractices } from '@/platform/messaging/service';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { NewThreadForm } from './new-thread-form';

export const metadata: Metadata = { title: 'Messages', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/messages');
  const sp = await searchParams;
  const [threads, practices] = await Promise.all([listPatientThreads(principal), messageablePractices(principal)]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Messages</h1>
        <p className="tl-page__lead">Conversations with the practices you have appointments with. For anything else, <Link href="/help">ask Toothlogy for help</Link>.</p>
      </header>
      {threads.length === 0 ? (
        <EmptyState title="No conversations yet" description="Write to a practice below, once you have an appointment with it." />
      ) : (
        <ul className="tl-list" aria-label="Conversations">
          {threads.map((t) => (
            <li key={t.id}>
              <Card label={t.subject}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/account/messages/${t.id}`}>
                        <strong>{t.subject}</strong>
                      </Link>
                      {t.unread ? <Badge tone="info">new reply</Badge> : null}
                      {t.status === 'CLOSED' ? <Badge tone="neutral">closed</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {t.organization} · {when(t.lastMessageAt)}
                    </span>
                    {t.last ? (
                      <span className="tl-list__meta">
                        {t.last.side === 'PATIENT' ? 'You: ' : ''}
                        {t.last.text}
                      </span>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card label="New message">
        <CardHeader>
          <strong>New message</strong>
        </CardHeader>
        <CardBody>
          {practices.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              You can write to a practice once you have an appointment with it. <Link href="/find">Find a dentist</Link>
            </p>
          ) : (
            <NewThreadForm practices={practices} organizationId={typeof sp.organization === 'string' ? sp.organization : undefined} appointmentId={typeof sp.appointment === 'string' ? sp.appointment : undefined} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
