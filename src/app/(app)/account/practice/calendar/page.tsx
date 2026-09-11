/**
 * TL-PAGE-PRACTICE-CALENDAR-001 — /account/practice/calendar?view=month|week|day&date=YYYY-MM-DD&practice=:id
 *
 * The practice's calendar for one practice (a dentist at a branch): every
 * appointment with its status, patient and service; the weekly sessions and
 * the clinic's opening hours; leave and blocked time; holidays and closures.
 * Each appointment opens its detail page.
 *
 * Server-rendered and link-driven: it works without JavaScript, and on a phone
 * the month grid becomes a list of days.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPracticeAppointments } from '@/platform/appointments/service';
import { loadAvailabilityContext } from '@/platform/appointments/availability';
import { addDays, localDateOf, zonedToUtc } from '@/lib/zoned-time';
import { minutesToHHMM } from '@/lib/opening-hours';
import { Badge, EmptyState } from '@/design-system';
import { PRACTICE_STATUS_LABELS, TYPE_LABELS } from '@/components/booking/status';

export const metadata: Metadata = { title: 'Calendar', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type View = 'month' | 'week' | 'day';
const VIEWS: readonly View[] = ['month', 'week', 'day'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Appointments shown in a month cell before "+ more". */
const MONTH_CELL_LIMIT = 3;

const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const mondayOf = (date: string) => addDays(date, dow(date) === 0 ? -6 : 1 - dow(date));
const monthStart = (date: string) => `${date.slice(0, 8)}01`;
function nextMonthStart(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
function previousMonthStart(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}
const windows = (list: Array<{ start: number; end: number }>) => list.map((w) => `${minutesToHHMM(w.start)}–${minutesToHHMM(w.end)}`).join(', ');

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice/calendar');
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');

  const manageableOrgs = principal.organizations
    .map((o) => o.organizationId)
    .filter((id) => can(principal, 'tl.appointment.diary.manage', { organizationId: id }));
  const practices = await db().dentistPractice.findMany({
    where: {
      location: { deletedAt: null },
      OR: [{ dentistProfile: { userId: principal.userId } }, { location: { organizationId: { in: manageableOrgs } } }],
    },
    select: {
      id: true,
      dentistProfile: { select: { user: { select: { displayName: true } } } },
      availabilityRules: { select: { dayOfWeek: true, startMinutes: true, endMinutes: true } },
      location: {
        select: {
          id: true,
          name: true,
          timezone: true,
          observesPublicHolidays: true,
          organization: { select: { name: true, countryCode: true } },
          businessHours: { select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (practices.length === 0) {
    return (
      <div className="tl-page">
        <h1>Calendar</h1>
        <EmptyState title="No practice diary to show" description="A calendar appears for each practice you run or manage." />
      </div>
    );
  }

  const practice = practices.find((p) => p.id === param('practice')) ?? practices[0]!;
  const tz = practice.location.timezone;
  const today = localDateOf(new Date(), tz);
  const view: View = (VIEWS as readonly string[]).includes(param('view')) ? (param('view') as View) : 'month';
  const date = DATE.test(param('date')) ? param('date') : today;

  let first: string;
  let last: string;
  let previous: string;
  let next: string;
  let title: string;
  const fmt = (d: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  if (view === 'month') {
    first = mondayOf(monthStart(date));
    last = addDays(mondayOf(addDays(nextMonthStart(date), -1)), 6);
    previous = previousMonthStart(date);
    next = nextMonthStart(date);
    title = fmt(date, { month: 'long', year: 'numeric' });
  } else if (view === 'week') {
    first = mondayOf(date);
    last = addDays(first, 6);
    previous = addDays(first, -7);
    next = addDays(first, 7);
    title = `${fmt(first, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  } else {
    first = date;
    last = date;
    previous = addDays(date, -1);
    next = addDays(date, 1);
    title = fmt(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const from = zonedToUtc(first, 0, tz);
  const to = zonedToUtc(addDays(last, 1), 0, tz);

  const [appointments, exceptions, closures, holidays, context] = await Promise.all([
    listPracticeAppointments(principal, { from, to }).then((list) => list.filter((a) => a.practiceId === practice.id)),
    db().availabilityException.findMany({ where: { practiceId: practice.id, startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: 'asc' } }),
    db().locationClosure.findMany({
      where: { locationId: practice.location.id, startsOn: { lte: new Date(`${last}T00:00:00Z`) }, endsOn: { gte: new Date(`${first}T00:00:00Z`) } },
    }),
    practice.location.observesPublicHolidays
      ? db().holiday.findMany({
          where: { countryCode: practice.location.organization.countryCode, isPublic: true, date: { gte: new Date(`${first}T00:00:00Z`), lte: new Date(`${last}T00:00:00Z`) } },
        })
      : Promise.resolve([]),
    // The same view of closed days the booking engine uses.
    loadAvailabilityContext(practice.id, first, last),
  ]);

  const days: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);

  const clinicHours = (d: string) =>
    practice.location.businessHours.filter((h) => h.dayOfWeek === dow(d)).map((h) => ({ start: h.opensAtMinutes, end: h.closesAtMinutes })).sort((a, b) => a.start - b.start);
  const sessions = (d: string) => {
    const rules = practice.availabilityRules.filter((r) => r.dayOfWeek === dow(d)).map((r) => ({ start: r.startMinutes, end: r.endMinutes })).sort((a, b) => a.start - b.start);
    return practice.availabilityRules.length > 0 ? rules : clinicHours(d);
  };
  const closedLabel = (d: string): string | null => {
    const holiday = holidays.find((h) => h.date.toISOString().slice(0, 10) === d);
    if (holiday) return holiday.name;
    const closure = closures.find((c) => c.startsOn.toISOString().slice(0, 10) <= d && c.endsOn.toISOString().slice(0, 10) >= d);
    if (closure) return closure.reason ? `Closed: ${closure.reason}` : 'Closed';
    return context.closedDates.has(d) ? 'Closed' : null;
  };
  const exceptionsOn = (d: string) => {
    const dayStart = zonedToUtc(d, 0, tz).getTime();
    const dayEnd = zonedToUtc(addDays(d, 1), 0, tz).getTime();
    return exceptions.filter((e) => e.startsAt.getTime() < dayEnd && e.endsAt.getTime() > dayStart);
  };
  const appointmentsOn = (d: string) => appointments.filter((a) => localDateOf(a.startsAt, tz) === d);
  const time = (at: Date) => new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: tz }).format(at);
  const href = (patch: Partial<{ view: View; date: string; practice: string }>) => {
    const q = new URLSearchParams({ view, date, practice: practice.id, ...patch });
    return `/account/practice/calendar?${q.toString()}`;
  };
  const patientOf = (a: (typeof appointments)[number]) => a.dependent?.name ?? a.patient.displayName ?? 'Patient';

  const appointmentLine = (a: (typeof appointments)[number], compact: boolean) => {
    const status = PRACTICE_STATUS_LABELS[a.status] ?? { label: a.status, tone: 'neutral' as const };
    return (
      <Link
        key={a.id}
        href={`/account/practice/appointments/${a.id}`}
        className={`tl-cal__appt tl-cal__appt--${status.tone}`}
        title={`${time(a.startsAt)} ${patientOf(a)} · ${a.serviceName} · ${status.label}`}
      >
        <strong>{time(a.startsAt)}</strong> {patientOf(a)}
        {compact ? null : (
          <span className="tl-list__meta">
            {' '}
            · {a.serviceName} · {TYPE_LABELS[a.type] ?? a.type} · <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        )}
      </Link>
    );
  };

  const exceptionLine = (e: (typeof exceptions)[number]) => (
    <span key={e.id} className="tl-cal__block">
      {e.kind === 'LEAVE' ? 'Leave' : 'Blocked'} {time(e.startsAt)}–{time(e.endsAt)}
      {e.reason ? ` · ${e.reason}` : ''}
    </span>
  );

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Calendar</span>
      </nav>
      <header className="tl-page__header">
        <h1>Calendar</h1>
        <p className="tl-page__lead">
          {practice.dentistProfile.user.displayName ?? 'Dentist'} · {practice.location.organization.name}, {practice.location.name} · times in {tz}
        </p>
      </header>

      {practices.length > 1 ? (
        <nav aria-label="Practice" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {practices.map((p) => (
            <Link
              key={p.id}
              href={href({ practice: p.id })}
              aria-current={p.id === practice.id ? 'page' : undefined}
              className={`tl-button tl-button--sm ${p.id === practice.id ? 'tl-button--primary' : 'tl-button--secondary'}`}
            >
              <span>
                {p.dentistProfile.user.displayName ?? 'Dentist'} · {p.location.name}
              </span>
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="tl-cal__toolbar">
        <nav aria-label="View" className="tl-inline">
          {VIEWS.map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={v === view ? 'page' : undefined} className={`tl-button tl-button--sm ${v === view ? 'tl-button--primary' : 'tl-button--ghost'}`}>
              <span>{v[0]!.toUpperCase() + v.slice(1)}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Dates" className="tl-inline">
          <Link href={href({ date: previous })} className="tl-button tl-button--sm tl-button--secondary" aria-label={`Previous ${view}`}>
            <span>‹</span>
          </Link>
          <Link href={href({ date: today })} className="tl-button tl-button--sm tl-button--secondary">
            <span>Today</span>
          </Link>
          <Link href={href({ date: next })} className="tl-button tl-button--sm tl-button--secondary" aria-label={`Next ${view}`}>
            <span>›</span>
          </Link>
        </nav>
        <h2 className="tl-cal__title">{title}</h2>
      </div>

      {context.blockedReason ? <p className="tl-muted">Not bookable at the moment: {context.blockedReason}</p> : null}

      {view === 'month' ? (
        <div className="tl-cal tl-cal--month" role="grid" aria-label={title}>
          {WEEKDAY_NAMES.map((n) => (
            <div key={n} className="tl-cal__head" role="columnheader">
              {n}
            </div>
          ))}
          {days.map((d) => {
            const closed = closedLabel(d);
            const list = appointmentsOn(d);
            const blocks = exceptionsOn(d);
            const outside = d.slice(0, 7) !== date.slice(0, 7);
            const hours = sessions(d);
            return (
              <div
                key={d}
                role="gridcell"
                className={['tl-cal__cell', outside ? 'tl-cal__cell--outside' : '', d === today ? 'tl-cal__cell--today' : '', closed ? 'tl-cal__cell--closed' : '', list.length === 0 && !closed && blocks.length === 0 ? 'tl-cal__cell--quiet' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <Link href={href({ view: 'day', date: d })} className="tl-cal__date" aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                  <span className="tl-cal__weekday">{fmt(d, { weekday: 'short' })} </span>
                  {Number(d.slice(8))}
                </Link>
                {closed ? <span className="tl-cal__closed">{closed}</span> : <span className="tl-cal__hours">{hours.length > 0 ? windows(hours) : 'No sessions'}</span>}
                {blocks.map(exceptionLine)}
                {list.slice(0, MONTH_CELL_LIMIT).map((a) => appointmentLine(a, true))}
                {list.length > MONTH_CELL_LIMIT ? (
                  <Link href={href({ view: 'day', date: d })} className="tl-cal__more">
                    + {list.length - MONTH_CELL_LIMIT} more
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`tl-cal ${view === 'week' ? 'tl-cal--week' : 'tl-cal--day'}`} aria-label={title}>
          {days.map((d) => {
            const closed = closedLabel(d);
            const list = appointmentsOn(d);
            const blocks = exceptionsOn(d);
            const hours = sessions(d);
            const clinic = clinicHours(d);
            return (
              <section key={d} className={['tl-cal__cell', d === today ? 'tl-cal__cell--today' : '', closed ? 'tl-cal__cell--closed' : ''].filter(Boolean).join(' ')} aria-label={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                <Link href={href({ view: 'day', date: d })} className="tl-cal__date">
                  {fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Link>
                {closed ? (
                  <span className="tl-cal__closed">{closed}</span>
                ) : (
                  <>
                    <span className="tl-cal__hours">Sessions: {hours.length > 0 ? windows(hours) : 'none'}</span>
                    {practice.availabilityRules.length > 0 ? <span className="tl-cal__hours">Clinic open: {clinic.length > 0 ? windows(clinic) : 'closed'}</span> : null}
                  </>
                )}
                {blocks.map(exceptionLine)}
                {list.length === 0 ? <span className="tl-muted">No appointments</span> : list.map((a) => appointmentLine(a, false))}
              </section>
            );
          })}
        </div>
      )}

      <p className="tl-muted">
        {appointments.length} appointment{appointments.length === 1 ? '' : 's'} in this {view}. Change sessions and time off in{' '}
        <Link href="/account/practice/availability">Availability</Link>.
      </p>
    </div>
  );
}
