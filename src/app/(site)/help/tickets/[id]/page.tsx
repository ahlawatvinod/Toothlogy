/**
 * TL-PAGE-TICKET-001 — /help/tickets/:id
 *
 * One support request: the conversation, reply, and — for support staff —
 * internal notes (marked, never shown to the requester), status and
 * assignment. The requester may close it. Anyone else: 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getTicket, STATUS_LABEL, SUPPORT_CATEGORIES, supportAgents } from '@/platform/support/service';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { TicketActions } from './ticket-actions';

export const metadata: Metadata = { title: 'Support request', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CATEGORY = new Map<string, string>(SUPPORT_CATEGORIES.map(([k, l]) => [k, l]));

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/help/tickets/${id}`);
  const loaded = await getTicket(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  const { ticket, isStaff } = loaded;
  const agents = isStaff ? await supportAgents() : [];
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        {isStaff ? <Link href="/admin/support">Support queue</Link> : <Link href="/help">Help</Link>}
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{ticket.subject}</h1>
          <Badge tone={ticket.status === 'WAITING_ON_USER' ? 'warning' : ticket.status === 'OPEN' ? 'info' : 'neutral'}>{isStaff && ticket.status === 'WAITING_ON_USER' ? 'Waiting for requester' : STATUS_LABEL[ticket.status]}</Badge>
        </div>
        <p className="tl-page__lead">
          {CATEGORY.get(ticket.category) ?? ticket.category}
          {ticket.organization ? ` · for ${ticket.organization.name}` : ''}
          {isStaff ? ` · from ${ticket.requester.displayName ?? ticket.requester.email}` : ''}
          {isStaff ? ` · ${ticket.assignedTo?.displayName ? `with ${ticket.assignedTo.displayName}` : 'unassigned'}` : ''}
        </p>
      </header>
      <Card label="Conversation">
        <CardHeader>
          <strong>Conversation</strong>
        </CardHeader>
        <CardBody>
          <ol className="tl-list" aria-label="Conversation">
            {ticket.messages.map((m) => (
              <li key={m.id} className="tl-stack">
                <span className="tl-list__meta">
                  <strong>{m.fromStaff ? 'Toothlogy support' : isStaff ? (ticket.requester.displayName ?? 'Requester') : 'You'}</strong> · {when(m.createdAt)}
                  {m.internal ? ' · ' : ''}
                  {m.internal ? <Badge tone="warning">internal note</Badge> : null}
                </span>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
      {ticket.status !== 'CLOSED' ? <TicketActions ticketId={ticket.id} isStaff={isStaff} status={ticket.status} agents={agents} assignedToUserId={ticket.assignedToUserId} /> : <p className="tl-muted">This request is closed. <Link href="/help">Ask again</Link> if you still need help.</p>}
    </div>
  );
}
