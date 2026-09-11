/**
 * TL-PAGE-ADMIN-OUTREACH-001 — /admin/operations/tasks
 *
 * The outreach queue: an operator's own tasks and the unassigned ones (a
 * lead sees everyone's), by district, due date and status, each with its
 * subject's contact details, recent activity and the actions allowed. 404
 * for anyone without the operations permission.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { listOperationsAgents, listOutreachTasks, MANAGE, PURPOSE_LABEL, WORK } from '@/platform/operations/outreach';
import { emailProvider, smsProvider } from '@/platform/notifications/ports';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { TaskActions } from './task-actions';

export const metadata: Metadata = { title: 'Outreach tasks (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const SCOPES = [
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['all', 'Everyone’s'],
] as const;
const STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;
const label = (v: string) => v.toLowerCase().replace(/_/g, ' ');

export default async function OutreachTasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/operations/tasks');
  if (!can(principal, WORK)) notFound();
  const isLead = can(principal, MANAGE);
  const sp = await searchParams;
  const scope = SCOPES.find(([s]) => s === sp.scope)?.[0] ?? 'mine';
  const status = STATUSES.find((s) => s === sp.status) ?? 'OPEN';
  const districtId = typeof sp.districtId === 'string' && sp.districtId ? sp.districtId : undefined;
  const overdue = sp.overdue === '1';
  const now = new Date();
  const [tasks, agents] = await Promise.all([listOutreachTasks(principal, { scope, status, districtId, overdue }, now), isLead ? listOperationsAgents() : Promise.resolve([])]);
  const invitesConfigured = emailProvider.isConfigured() && smsProvider.isConfigured();
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ scope, status, districtId, overdue: overdue ? '1' : undefined, ...next })) if (v) p.set(k, v);
    return `/admin/operations/tasks?${p.toString()}`;
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '64rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/admin/operations">Operations</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Outreach tasks</span>
      </nav>
      <header className="tl-page__header">
        <h1>Outreach tasks</h1>
        <p className="tl-page__lead">Log every call and visit. Working an unassigned task makes it yours.</p>
      </header>

      <nav aria-label="Whose tasks" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {SCOPES.filter(([s]) => s !== 'all' || isLead).map(([s, text]) => (
          <Link key={s} href={href({ scope: s })} aria-current={scope === s ? 'page' : undefined} className={`tl-button tl-button--sm ${scope === s ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>{text}</span>
          </Link>
        ))}
        {STATUSES.map((s) => (
          <Link key={s} href={href({ status: s })} aria-current={status === s ? 'page' : undefined} className={`tl-button tl-button--sm ${status === s ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>{label(s)}</span>
          </Link>
        ))}
        {/* A link, not a toggle button: aria-pressed is not allowed on links; the active filter is marked current. */}
        <Link href={href({ overdue: overdue ? '' : '1' })} aria-current={overdue ? 'true' : undefined} className={`tl-button tl-button--sm ${overdue ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>Overdue only</span>
        </Link>
        {districtId ? (
          <Link href={href({ districtId: '' })} className="tl-button tl-button--sm tl-button--ghost">
            <span>All districts ✕</span>
          </Link>
        ) : null}
      </nav>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks here" description={scope === 'mine' ? 'Nothing assigned to you. Look at the unassigned tasks.' : 'Nothing matches.'} />
      ) : (
        <ul className="tl-list" aria-label="Outreach tasks">
          {tasks.map((task) => {
            const subject = task.extractedRecord ?? task.organization;
            const late = task.status === 'OPEN' && task.dueAt && task.dueAt < now;
            const canInvite = task.purpose === 'ACTIVATE_ACCOUNT' && task.extractedRecord?.premadeUser?.status === 'PENDING_ACTIVATION';
            return (
              <li key={task.id}>
                <Card label={task.title}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <strong>{task.title}</strong>
                        <Badge tone="info">{PURPOSE_LABEL[task.purpose]}</Badge>
                        {task.status !== 'OPEN' ? <Badge tone={task.status === 'DONE' ? 'success' : 'neutral'}>{label(task.status)}</Badge> : null}
                        {late ? <Badge tone="danger">overdue</Badge> : null}
                        {task.priority > 0 ? <Badge tone="warning">priority {task.priority}</Badge> : null}
                      </div>
                      <span className="tl-list__meta">
                        {task.district ? `${task.district.name}, ${task.district.region.name}` : 'No district'} · {task.assignedTo?.displayName ? `with ${task.assignedTo.displayName}` : 'unassigned'}
                        {task.dueAt ? ` · due ${when(task.dueAt)}` : ''}
                        {task.outcome ? ` · outcome: ${label(task.outcome)}` : ''}
                      </span>
                      {subject ? (
                        <span className="tl-list__meta">
                          {subject.phone ? <a href={`tel:${subject.phone}`}>{subject.phone}</a> : 'no phone'}
                          {' · '}
                          {subject.email ? <a href={`mailto:${subject.email}`}>{subject.email}</a> : 'no email'}
                          {task.extractedRecord ? ' · from directory data, unverified' : ''}
                        </span>
                      ) : null}
                      {task.activities.length > 0 ? (
                        <ol className="tl-list" aria-label="Recent activity">
                          {task.activities.map((a) => (
                            <li key={a.id} className="tl-list__meta">
                              {when(a.createdAt)} · {label(a.type)}
                              {a.outcome ? ` — ${label(a.outcome)}` : ''}
                              {a.note ? `: ${a.note}` : ''}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {task.status === 'OPEN' ? (
                        <TaskActions
                          taskId={task.id}
                          mine={task.assignedToUserId === principal.userId}
                          unassigned={task.assignedToUserId === null}
                          isLead={isLead}
                          selfId={principal.userId}
                          agents={agents}
                          canInvite={canInvite}
                          invitesConfigured={invitesConfigured}
                        />
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
