/**
 * TL-PAGE-PRACTICE-LEADS-001 — /account/practice/leads
 *
 * Leads for every organization the signed-in user may read leads for: the
 * full count (free, paid, waiting for funds, delivered, completed, converted,
 * rejected, duplicate), spend and GST from the ledger, the wallet, visit rate
 * and conversion rate kept apart, and each lead with its billing decision. A
 * callback patient's contact details appear only once the lead is free or
 * paid for.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { leadStats, listLeads } from '@/platform/leads/service';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { LeadActions } from './lead-actions';
import { LeadWork } from './lead-work';

const OPEN_STATUSES = ['DELIVERED', 'ACCEPTED', 'CONTACTED', 'APPOINTMENT'];
const WORK_LABEL: Record<string, string> = {
  CALL_LOGGED: 'Call',
  NOTE: 'Note',
  ASSIGNED: 'Assigned',
  UNASSIGNED: 'Unassigned',
  FOLLOW_UP_SET: 'Follow-up scheduled',
  FOLLOW_UP_CLEARED: 'Follow-up cleared',
};

export const metadata: Metadata = { title: 'Leads', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  NEW: 'neutral',
  QUALIFIED: 'info',
  DELIVERED: 'warning',
  ACCEPTED: 'info',
  CONTACTED: 'info',
  APPOINTMENT: 'info',
  COMPLETED: 'success',
  CONVERTED: 'success',
  REJECTED: 'danger',
  LOST: 'neutral',
  NOT_QUALIFIED: 'neutral',
  DUPLICATE: 'neutral',
};

const STATUS_FILTERS = ['DELIVERED', 'ACCEPTED', 'CONTACTED', 'APPOINTMENT', 'COMPLETED', 'CONVERTED', 'REJECTED', 'DUPLICATE', 'NOT_QUALIFIED', 'LOST'];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice/leads');
  const sp = await searchParams;
  const status = typeof sp.status === 'string' && STATUS_FILTERS.includes(sp.status) ? sp.status : undefined;
  const billing = typeof sp.billing === 'string' ? sp.billing : undefined;
  const mine = sp.mine === '1';
  const due = sp.due === '1';
  const now = new Date();

  const orgIds = principal.organizations.map((o) => o.organizationId).filter((id) => can(principal, 'tl.leads.lead.read', { organizationId: id }));
  const organizations = await db().organization.findMany({ where: { id: { in: orgIds }, deletedAt: null }, select: { id: true, name: true } });
  const data = await Promise.all(
    organizations.map(async (o) => ({
      organization: o,
      leads: (await listLeads(principal, o.id, { status })).filter(
        (l) =>
          (!billing || l.billingStatus === billing) &&
          (!mine || l.assignedToUserId === principal.userId) &&
          (!due || (l.nextFollowUpAt !== null && new Date(l.nextFollowUpAt) <= now && OPEN_STATUSES.includes(l.status))),
      ),
      members: (
        await db().organizationMember.findMany({ where: { organizationId: o.id, leftAt: null }, select: { userId: true, user: { select: { displayName: true, email: true } } } })
      ).map((m) => ({ userId: m.userId, name: m.user.displayName ?? m.user.email ?? 'Member' })),
      stats: await leadStats(principal, o.id),
      canManage: can(principal, 'tl.leads.lead.manage', { organizationId: o.id }),
      canDispute: can(principal, 'tl.billing.dispute.raise', { organizationId: o.id }),
      canSeeWallet: can(principal, 'tl.billing.wallet.read', { organizationId: o.id }),
    })),
  );
  const money = (minor: string | bigint, currency: string) => formatMoney({ amountMinor: BigInt(minor), currency }, 'en-IN');
  const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
  const filtered = Boolean(status || billing || mine || due);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Leads</span>
      </nav>
      <header className="tl-page__header">
        <h1>Leads</h1>
        <p className="tl-page__lead">
          A lead is billed only when it qualifies: a verified patient, not a repeat of a recent request, not internal, and — for bookings — once you
          confirm the appointment. {filtered ? <Link href="/account/practice/leads">Show all</Link> : null}
        </p>
      </header>

      <nav aria-label="Lead work" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href="/account/practice/leads?mine=1" aria-current={mine ? 'page' : undefined} className={`tl-button tl-button--sm ${mine ? 'tl-button--primary' : 'tl-button--ghost'}`}>
          <span>Assigned to me</span>
        </Link>
        <Link href="/account/practice/leads?due=1" aria-current={due ? 'page' : undefined} className={`tl-button tl-button--sm ${due ? 'tl-button--primary' : 'tl-button--ghost'}`}>
          <span>Follow-ups due</span>
        </Link>
      </nav>

      {data.length === 0 ? <EmptyState title="No leads to show" description="Leads appear for organizations whose leads you may see." /> : null}

      {data.map(({ organization, leads, members, stats, canManage, canDispute, canSeeWallet }) => {
        const currency = stats.currency ?? 'INR';
        const tiles: Array<[string, string | number, string | null]> = [
          ['Total leads', stats.total, null],
          ['Free', stats.free, '/account/practice/leads?billing=FREE'],
          ['Paid', stats.paid, '/account/practice/leads?billing=CHARGED'],
          ['Waiting for funds', stats.pendingFunds, '/account/practice/leads?billing=PENDING_FUNDS'],
          ['Delivered', stats.delivered, null],
          ['Completed visits', stats.completed, '/account/practice/leads?status=COMPLETED'],
          ['Converted', stats.converted, '/account/practice/leads?status=CONVERTED'],
          ['Rejected', stats.rejected, '/account/practice/leads?status=REJECTED'],
          ['Duplicates (not billed)', stats.duplicate, '/account/practice/leads?status=DUPLICATE'],
          ['Total spend', money(stats.spendGrossMinor, currency), null],
          ['GST in spend', money(stats.gstMinor, currency), null],
          ['Visit rate', stats.visitRate === null ? '—' : `${stats.visitRate}%`, null],
          ['Conversion rate', stats.conversionRate === null ? '—' : `${stats.conversionRate}%`, null],
        ];
        return (
          <Card key={organization.id} label={organization.name}>
            <CardHeader>
              <div className="tl-card__title-row">
                <strong>{organization.name}</strong>
                {canSeeWallet ? (
                  <Link href={`/account/organizations/${organization.id}/billing`}>Wallet {money(stats.walletBalanceMinor, currency)}</Link>
                ) : null}
              </div>
            </CardHeader>
            <CardBody>
              <dl className="tl-kv">
                {tiles.map(([label, value, href]) => (
                  <div key={label}>
                    <dt>{href ? <Link href={href}>{label}</Link> : label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="tl-muted">
                Visit rate: qualified leads that led to a completed visit. Conversion rate: those you marked as going ahead with treatment.
              </p>

              {leads.length === 0 ? (
                <p className="tl-muted">No leads{filtered ? ' match this filter' : ''} yet.</p>
              ) : (
                <ul className="tl-list">
                  {leads.map((lead) => {
                    const ordinal = lead.billingOrdinal ? ` (lead ${lead.billingOrdinal})` : '';
                    const billingLabel =
                      lead.billingStatus === 'FREE'
                        ? `Free${ordinal}`
                        : lead.billingStatus === 'CHARGED' && lead.priceMinor && lead.currency
                          ? `Charged ${money(BigInt(lead.priceMinor) + BigInt(lead.taxMinor ?? '0'), lead.currency)}${ordinal}`
                          : lead.billingStatus === 'PENDING_FUNDS'
                            ? `Waiting for funds${ordinal}`
                            : lead.billingStatus === 'REFUNDED'
                              ? 'Refunded'
                              : lead.billingStatus === 'WAIVED'
                                ? 'Waived'
                                : 'Not billed';
                    return (
                      <li key={lead.id} className="tl-stack">
                        <div className="tl-card__title-row">
                          <strong>{lead.patientName}</strong>
                          <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status.replace('_', ' ').toLowerCase()}</Badge>
                          <Badge tone={lead.billingStatus === 'CHARGED' ? 'info' : lead.billingStatus === 'PENDING_FUNDS' ? 'warning' : lead.billingStatus === 'FREE' ? 'success' : 'neutral'}>
                            {billingLabel}
                          </Badge>
                          {lead.dispute ? <Badge tone="neutral">Dispute {lead.dispute.status.toLowerCase()}</Badge> : null}
                        </div>
                        <span className="tl-list__meta">
                          {lead.source === 'BOOKING' ? 'Booking' : 'Callback request'} · {lead.service} · {lead.location} · {when(lead.createdAt)}
                          {lead.patientPhone ? ` · ${lead.patientPhone}` : ''}
                          {lead.patientEmail ? ` · ${lead.patientEmail}` : ''}
                        </span>
                        {lead.patientNote ? <span className="tl-list__meta">“{lead.patientNote}”</span> : null}
                        {lead.qualificationReason ? <span className="tl-list__meta">Qualification: {lead.qualificationReason}</span> : null}
                        {lead.appointment ? (
                          <span className="tl-list__meta">
                            <Link href={`/account/practice/appointments/${lead.appointment.id}`}>Appointment {lead.appointment.status.toLowerCase()}</Link>
                          </span>
                        ) : null}
                        {lead.assignedToName || lead.nextFollowUpAt ? (
                          <span className="tl-list__meta">
                            {lead.assignedToName ? `With ${lead.assignedToName}` : 'Unassigned'}
                            {lead.nextFollowUpAt ? ` · follow up ${when(lead.nextFollowUpAt)}` : ''}
                            {lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= now && OPEN_STATUSES.includes(lead.status) ? ' (due)' : ''}
                          </span>
                        ) : null}
                        {lead.workLog.length > 0 ? (
                          <ol className="tl-list" aria-label="Recent work on this lead">
                            {lead.workLog.map((w) => (
                              <li key={w.id} className="tl-list__meta">
                                {when(w.createdAt)} · {WORK_LABEL[w.action] ?? w.action}
                                {w.detail?.outcome ? ` — ${w.detail.outcome.toLowerCase().replace(/_/g, ' ')}` : ''}
                                {w.detail?.note ? `: ${w.detail.note}` : ''}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                        <LeadActions leadId={lead.id} status={lead.status} canManage={canManage} canDispute={canDispute && lead.billingStatus === 'CHARGED' && !lead.dispute} />
                        {OPEN_STATUSES.includes(lead.status) && (canManage || lead.assignedToUserId === principal.userId) ? (
                          <LeadWork leadId={lead.id} canAssign={canManage} members={members} assignedToUserId={lead.assignedToUserId} contactVisible={lead.contactVisible} nextFollowUpAt={lead.nextFollowUpAt} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
