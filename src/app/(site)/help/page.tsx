/**
 * TL-PAGE-HELP-001 — /help
 *
 * Help from Toothlogy's team: ask by category (signed in), and follow your
 * requests. No invented help articles — the pages that do things say how
 * they work where you use them; this is where you reach a person.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { myTickets, STATUS_LABEL, SUPPORT_CATEGORIES, WORK } from '@/platform/support/service';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { TicketForm } from './ticket-form';

export const metadata: Metadata = { title: 'Help', description: 'Ask Toothlogy’s team for help with your account, a booking, billing, verification or your data.' };
export const dynamic = 'force-dynamic';

export default async function HelpPage() {
  const principal = await currentPrincipal();
  const signedIn = isAuthenticated(principal);
  const [tickets, organizations] = signedIn
    ? await Promise.all([myTickets(principal), db().organization.findMany({ where: { id: { in: principal.organizations.map((o) => o.organizationId) }, deletedAt: null }, select: { id: true, name: true } })])
    : [[], []];
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Help</h1>
        <p className="tl-page__lead">
          Ask Toothlogy’s team. For a question about your treatment or appointment, <Link href="/account/messages">message your practice</Link> instead — they know your case.
        </p>
      </header>
      {signedIn && can(principal, WORK) ? (
        <p>
          <Link href="/admin/support">Open the support queue</Link>
        </p>
      ) : null}
      <Card label="Ask for help">
        <CardHeader>
          <strong>Ask for help</strong>
        </CardHeader>
        <CardBody>
          {signedIn ? (
            <TicketForm categories={SUPPORT_CATEGORIES.map(([value, label]) => ({ value, label }))} organizations={organizations} />
          ) : (
            <p style={{ margin: 0 }}>
              <Link href="/login?next=/help">Sign in</Link> to ask for help and follow the answer. Can’t sign in? <Link href="/forgot-password">Reset your password</Link>, or use the <Link href="/contact">contact page</Link>.
            </p>
          )}
        </CardBody>
      </Card>
      {signedIn ? (
        <Card label="Your requests">
          <CardHeader>
            <strong>Your requests</strong>
          </CardHeader>
          <CardBody>
            {tickets.length === 0 ? (
              <EmptyState title="No requests yet" description="What you ask appears here with our replies." />
            ) : (
              <ul className="tl-list" aria-label="Your requests">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <div className="tl-card__title-row">
                      <Link href={`/help/tickets/${t.id}`}>
                        <strong>{t.subject}</strong>
                      </Link>
                      <Badge tone={t.status === 'WAITING_ON_USER' ? 'warning' : t.status === 'OPEN' ? 'info' : 'neutral'}>{STATUS_LABEL[t.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">Last activity {when(t.lastActivityAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
