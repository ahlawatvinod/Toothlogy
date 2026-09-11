/**
 * TL-PAGE-APPOINTMENTS-001 — /account/appointments
 *
 * The patient's appointments — upcoming, past, cancelled — and waitlist
 * entries. Read from the database on every request; dates are formatted here,
 * in the patient's locale and the clinic's timezone.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPatientAppointments, PATIENT_GROUPS } from '@/platform/appointments/service';
import { listWaitlist } from '@/platform/appointments/waitlist';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { STATUS_LABELS, TYPE_LABELS } from '@/components/booking/status';
import { LeaveWaitlistButton } from './leave-waitlist-button';

export const metadata: Metadata = { title: 'Appointments', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/appointments');
  const [appointments, waitlist, user] = await Promise.all([
    listPatientAppointments(principal.userId),
    listWaitlist(principal.userId),
    db().user.findUnique({ where: { id: principal.userId }, select: { locale: true } }),
  ]);
  const locale = user?.locale ?? 'en-IN';
  const when = (d: Date, tz: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

  const upcoming = appointments
    .filter((a) => (PATIENT_GROUPS.upcoming as readonly string[]).includes(a.status))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = appointments.filter((a) => (PATIENT_GROUPS.past as readonly string[]).includes(a.status));
  const cancelled = appointments.filter((a) => (PATIENT_GROUPS.cancelled as readonly string[]).includes(a.status));
  const openWaits = waitlist.filter((w) => w.status === 'ACTIVE' || w.status === 'OFFERED');

  const list = (items: typeof appointments) => (
    <ul className="tl-list">
      {items.map((a) => {
        const status = STATUS_LABELS[a.status] ?? { label: a.status, tone: 'neutral' as const };
        return (
          <li key={a.id}>
            <div className="tl-card__title-row">
              <Link href={`/account/appointments/${a.id}`}>
                <strong>{when(a.startsAt, a.timezone)}</strong>
              </Link>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <span className="tl-list__meta">
              {a.dentistProfile.user.displayName ?? 'Dentist'} · {a.serviceName} · {TYPE_LABELS[a.type] ?? a.type} · {a.organization.name}, {a.location.name}
              {a.dependent ? ` · for ${a.dependent.name}` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Appointments</h1>
        <p className="tl-page__lead">
          <Link href="/find">Find a dentist</Link> to book a new one.
        </p>
      </header>

      <Card label="Upcoming">
        <CardHeader>
          <strong>Upcoming</strong>
        </CardHeader>
        <CardBody>
          {upcoming.length === 0 ? <EmptyState title="Nothing booked" description="Appointments you book appear here." /> : list(upcoming)}
        </CardBody>
      </Card>

      {openWaits.length > 0 ? (
        <Card label="Waitlist">
          <CardHeader>
            <strong>Waiting for an opening</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {openWaits.map((w) => (
                <li key={w.id}>
                  <div className="tl-card__title-row">
                    <strong>
                      {day(w.earliestDate)} – {day(w.latestDate)}
                    </strong>
                    <Badge tone={w.status === 'OFFERED' ? 'warning' : 'neutral'}>{w.status === 'OFFERED' ? 'A time is held for you' : 'Waiting'}</Badge>
                    <LeaveWaitlistButton entryId={w.id} />
                  </div>
                  {w.hold && w.hold.status === 'PENDING' ? (
                    <span className="tl-list__meta">
                      <Link href={`/account/appointments/${w.hold.id}`}>See the held time and confirm it</Link>
                    </span>
                  ) : (
                    <span className="tl-list__meta">{w.timeOfDay === 'ANY' ? 'Any time of day' : w.timeOfDay.toLowerCase()}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {past.length > 0 ? (
        <Card label="Past">
          <CardHeader>
            <strong>Past</strong>
          </CardHeader>
          <CardBody>{list(past)}</CardBody>
        </Card>
      ) : null}

      {cancelled.length > 0 ? (
        <Card label="Cancelled and declined">
          <CardHeader>
            <strong>Cancelled, declined and lapsed</strong>
          </CardHeader>
          <CardBody>{list(cancelled)}</CardBody>
        </Card>
      ) : null}
    </div>
  );
}
