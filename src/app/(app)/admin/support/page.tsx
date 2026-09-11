/**
 * TL-PAGE-ADMIN-SUPPORT-001 — /admin/support
 *
 * The support queue: open and waiting requests, oldest activity first; or
 * mine, resolved, closed. 404 for anyone without support work.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { SupportTicketStatus } from '@prisma/client';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { STATUS_LABEL, SUPPORT_CATEGORIES, supportQueue, WORK } from '@/platform/support/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Support (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const CATEGORY = new Map<string, string>(SUPPORT_CATEGORIES.map(([k, l]) => [k, l]));
const FILTERS: Array<[string, string]> = [
  ['', 'Open and waiting'],
  ['mine', 'Mine'],
  ['RESOLVED', 'Resolved'],
  ['CLOSED', 'Closed'],
];

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/support');
  if (!can(principal, WORK)) notFound();
  const sp = await searchParams;
  const view = typeof sp.view === 'string' ? sp.view : '';
  const tickets = await supportQueue(principal, view === 'mine' ? { mine: true } : view === 'RESOLVED' || view === 'CLOSED' ? { status: view as SupportTicketStatus } : {});
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const now = new Date();

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <header className="tl-page__header">
        <h1>Support (staff)</h1>
        <p className="tl-page__lead">Answer what you can; use internal notes for what the requester does not need to see.</p>
      </header>
      <nav aria-label="View" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {FILTERS.map(([value, label]) => (
          <Link key={value || 'open'} href={value ? `/admin/support?view=${value}` : '/admin/support'} aria-current={view === value ? 'page' : undefined} className={`tl-button tl-button--sm ${view === value ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      {tickets.length === 0 ? (
        <EmptyState title="Nothing here" description="No requests in this view." />
      ) : (
        <ul className="tl-list" aria-label="Support requests">
          {tickets.map((t) => (
            <li key={t.id}>
              <Card label={t.subject}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/help/tickets/${t.id}`}>
                        <strong>{t.subject}</strong>
                      </Link>
                      <Badge tone={t.status === 'OPEN' ? 'info' : t.status === 'WAITING_ON_USER' ? 'warning' : 'neutral'}>{t.status === 'WAITING_ON_USER' ? 'Waiting for requester' : STATUS_LABEL[t.status]}</Badge>
                      {t.priority ? <Badge tone="info">Priority (Prime)</Badge> : null}
                      {t.slaFirstResponseDueAt && !t.firstRespondedAt && t.slaFirstResponseDueAt < now ? <Badge tone="warning">First-reply SLA breached</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {CATEGORY.get(t.category) ?? t.category} · {t.requester.displayName ?? t.requester.email} · {t._count.messages} messages · last activity {when(t.lastActivityAt)} · {t.assignedTo?.displayName ? `with ${t.assignedTo.displayName}` : 'unassigned'}
                      {t.slaFirstResponseDueAt
                        ? t.firstRespondedAt
                          ? t.firstRespondedAt <= t.slaFirstResponseDueAt
                            ? ' · first reply within the enterprise SLA'
                            : ' · first reply after the enterprise SLA'
                          : ` · enterprise SLA: first reply due ${when(t.slaFirstResponseDueAt)}`
                        : ''}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
