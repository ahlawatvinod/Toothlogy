/**
 * TL-PAGE-PRACTICE-001 — /account/practice
 *
 * The practice's day: requests that need an answer, today's patients, the
 * next seven days, and what happened recently — for the signed-in dentist's
 * own appointments and every organization whose diary they may run. Every
 * action here goes through the appointment state machine.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPracticeAppointments } from '@/platform/appointments/service';
import { localDateOf } from '@/lib/zoned-time';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { PRACTICE_STATUS_LABELS, TYPE_LABELS } from '@/components/booking/status';
import { PracticeActions } from './practice-actions';
import { allowedPracticeActions } from './allowed';

export const metadata: Metadata = { title: 'Practice', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PracticePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice');

  const now = new Date();
  const [appointments, organizations, user] = await Promise.all([
    listPracticeAppointments(principal, { from: new Date(now.getTime() - 3 * 86_400_000), to: new Date(now.getTime() + 8 * 86_400_000) }),
    db().organization.findMany({
      where: { id: { in: principal.organizations.map((o) => o.organizationId) }, deletedAt: null },
      select: { id: true, name: true },
    }),
    db().user.findUnique({ where: { id: principal.userId }, select: { locale: true } }),
  ]);
  const locale = user?.locale ?? 'en-IN';
  const time = (d: Date, tz: string) => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: tz }).format(d);
  const dayHeading = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const full = (d: Date, tz: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(d);

  const needsResponse = appointments.filter((a) => a.status === 'REQUESTED');
  const waitingPatient = appointments.filter((a) => a.status === 'PENDING');
  const active = appointments.filter((a) => ['CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'].includes(a.status) && a.endsAt.getTime() >= now.getTime() - 6 * 3_600_000);
  const today = active.filter((a) => localDateOf(a.startsAt, a.timezone) === localDateOf(now, a.timezone));
  const later = active.filter((a) => !today.includes(a) && a.startsAt > now);
  const recent = appointments
    .filter((a) => ['COMPLETED', 'NO_SHOW', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(a.status))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .slice(0, 15);

  const byDay = new Map<string, typeof later>();
  for (const a of later) {
    const key = localDateOf(a.startsAt, a.timezone);
    byDay.set(key, [...(byDay.get(key) ?? []), a]);
  }

  const row = (a: (typeof appointments)[number], withDate = false) => {
    const status = PRACTICE_STATUS_LABELS[a.status] ?? { label: a.status, tone: 'neutral' as const };
    return (
      <li key={a.id} className="tl-stack">
        <div className="tl-card__title-row">
          <Link href={`/account/practice/appointments/${a.id}`}>
            <strong>{withDate ? full(a.startsAt, a.timezone) : time(a.startsAt, a.timezone)}</strong>
          </Link>
          <Badge tone={status.tone}>{status.label}</Badge>
          {a.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
        </div>
        <span className="tl-list__meta">
          {a.dependent ? `${a.dependent.name} (booked by ${a.patient.displayName ?? 'patient'})` : (a.patient.displayName ?? 'Patient')} · {a.serviceName} ·{' '}
          {TYPE_LABELS[a.type] ?? a.type} · {a.dentistProfile.user.displayName ?? 'Dentist'} · {a.location.name}
        </span>
        {a.patientNote ? <span className="tl-list__meta">“{a.patientNote}”</span> : null}
        <PracticeActions
          appointmentId={a.id}
          practiceId={a.practiceId}
          serviceOfferingId={a.serviceOfferingId}
          type={a.type}
          timezone={a.timezone}
          startsAt={a.startsAt.toISOString()}
          allowed={allowedPracticeActions(a, now.getTime())}
        />
      </li>
    );
  };

  const billingOrgs = organizations.filter((o) => can(principal, 'tl.billing.wallet.read', { organizationId: o.id }));
  const leadOrgs = organizations.filter((o) => can(principal, 'tl.leads.lead.read', { organizationId: o.id }));
  const campaignOrgs = organizations.filter((o) => can(principal, 'tl.advertising.campaign.manage', { organizationId: o.id }));

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Practice</h1>
        <p className="tl-page__lead">
          <Link href="/account/practice/calendar">Calendar</Link>
          {' · '}
          <Link href="/account/practice/availability">Availability</Link>
          {leadOrgs.length > 0 ? (
            <>
              {' · '}
              <Link href="/account/practice/leads">Leads</Link>
            </>
          ) : null}
          {billingOrgs.map((o) => (
            <span key={o.id}>
              {' · '}
              <Link href={`/account/organizations/${o.id}/billing`}>Billing: {o.name}</Link>
            </span>
          ))}
          {campaignOrgs.map((o) => (
            <span key={`c-${o.id}`}>
              {' · '}
              <Link href={`/account/organizations/${o.id}/campaigns`}>Prime: {o.name}</Link>
            </span>
          ))}
        </p>
      </header>

      {needsResponse.length > 0 ? (
        <Card label="Needs your response">
          <CardHeader>
            <strong>Needs your response ({needsResponse.length})</strong>
          </CardHeader>
          <CardBody>
            <p className="tl-muted" style={{ marginTop: 0 }}>
              These times are held for the patient until you answer or the request lapses.
            </p>
            <ul className="tl-list">{needsResponse.map((a) => row(a, true))}</ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Today">
        <CardHeader>
          <strong>Today</strong>
        </CardHeader>
        <CardBody>
          {today.length === 0 ? <EmptyState title="No appointments today" description="Confirmed appointments for today appear here." /> : <ul className="tl-list">{today.map((a) => row(a))}</ul>}
        </CardBody>
      </Card>

      <Card label="Next seven days">
        <CardHeader>
          <strong>Next seven days</strong>
        </CardHeader>
        <CardBody>
          {byDay.size === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              Nothing booked yet.
            </p>
          ) : (
            [...byDay.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, list]) => (
                <section key={date} aria-label={dayHeading(date)} className="tl-stack">
                  <h3 style={{ marginBlock: 'var(--tl-space-2) 0', fontSize: 'var(--tl-text-base)' }}>{dayHeading(date)}</h3>
                  <ul className="tl-list">{list.map((a) => row(a))}</ul>
                </section>
              ))
          )}
        </CardBody>
      </Card>

      {waitingPatient.length > 0 ? (
        <Card label="Waiting for the patient">
          <CardHeader>
            <strong>Waiting for the patient</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">{waitingPatient.map((a) => row(a, true))}</ul>
          </CardBody>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <Card label="Recent">
          <CardHeader>
            <strong>Recent</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">{recent.map((a) => row(a, true))}</ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
