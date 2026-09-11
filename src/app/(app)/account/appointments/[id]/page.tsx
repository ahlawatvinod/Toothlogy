/**
 * TL-PAGE-APPOINTMENT-DETAIL-001 — /account/appointments/:id
 *
 * One appointment, for its patient. A practice member following a link here
 * is sent to the practice view of the same appointment; anyone else gets a
 * 404. Which actions are offered is decided here, from the state machine's
 * own rules; the API decides again when an action is taken.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getAppointment } from '@/platform/appointments/service';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { STATUS_LABELS, TYPE_LABELS } from '@/components/booking/status';
import { bookableAlternatives } from '@/platform/appointments/alternatives';
import { videoMeetingView } from '@/platform/video/service';
import { PatientActions } from './patient-actions';
import { reviewability } from '@/platform/reviews/service';
import { Stars } from '@/components/reviews/stars';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: 'Appointment', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const REBOOKABLE = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW', 'EXPIRED'];

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/appointments/${id}`);

  let loaded;
  try {
    loaded = await getAppointment(principal, id);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  if (loaded.actor === 'PRACTICE') redirect(`/account/practice/appointments/${id}`);
  const a = loaded.appointment;

  const user = await db().user.findUnique({ where: { id: principal.userId }, select: { locale: true } });
  const locale = user?.locale ?? 'en-IN';
  const when = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: a.timezone }).format(d);
  const short = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: a.timezone }).format(d);
  const now = new Date().getTime();
  const status = STATUS_LABELS[a.status] ?? { label: a.status, tone: 'neutral' as const };

  const canCheckIn = a.status === 'CONFIRMED' && now >= a.startsAt.getTime() - 60 * 60_000 && now <= a.endsAt.getTime();
  const canAccept = a.status === 'PENDING' && (!a.expiresAt || a.expiresAt.getTime() > now);
  const canCancel = ['REQUESTED', 'PENDING', 'CONFIRMED'].includes(a.status);
  const canReschedule = ['REQUESTED', 'CONFIRMED'].includes(a.status) && a.rescheduleCount < 3;
  const rebookHref = REBOOKABLE.includes(a.status)
    ? `/book/${a.dentistProfile.slug}?practice=${a.practiceId}${a.serviceOfferingId ? `&service=${a.serviceOfferingId}` : ''}&rebook=${a.id}`
    : null;
  const lastProposal = [...a.events].reverse().find((e) => e.action === 'RESCHEDULE' && e.actor === 'PRACTICE');
  const [alternatives, video, review] = await Promise.all([
    rebookHref ? bookableAlternatives(a) : Promise.resolve(null),
    a.type === 'VIDEO' ? videoMeetingView(a.id, 'PATIENT') : Promise.resolve(null),
    a.status === 'COMPLETED' ? reviewability(principal, a.id) : Promise.resolve(null),
  ]);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/appointments">Appointments</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{short(a.startsAt)}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{when(a.startsAt)}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="tl-page__lead">
          {a.dentistProfile.user.displayName ?? 'Dentist'} · {a.serviceName} · {TYPE_LABELS[a.type] ?? a.type}
        </p>
      </header>

      {a.status === 'PENDING' && a.waitlistEntryId ? (
        <p>
          <strong>A time opened up from your waitlist</strong> and is held for you
          {a.expiresAt ? ` until ${short(a.expiresAt)}` : ''}. Confirm it to keep it.
        </p>
      ) : null}
      {a.status === 'PENDING' && !a.waitlistEntryId ? (
        <p>
          <strong>The clinic proposed this new time</strong>
          {lastProposal?.reason ? ` (“${lastProposal.reason}”)` : ''}. Confirm it, or cancel if it does not suit you.
        </p>
      ) : null}
      {a.status === 'REQUESTED' && a.expiresAt ? (
        <p className="tl-muted">The clinic will confirm or decline by {short(a.expiresAt)}. The time is held for you meanwhile.</p>
      ) : null}
      {a.rejectionReason ? <p>The clinic declined: {a.rejectionReason}</p> : null}
      {a.cancellationReason ? <p>Cancelled{a.cancelledBy === 'PRACTICE' ? ' by the clinic' : ''}: {a.cancellationReason}</p> : null}
      {a.followUpDueAt ? (
        <p>
          Follow-up recommended around {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: a.timezone }).format(a.followUpDueAt)}
          {a.followUpNote ? ` — ${a.followUpNote}` : ''}.
        </p>
      ) : null}

      <Card label="Details">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Where</dt>
              <dd>
                {a.type === 'CLINIC'
                  ? `${a.organization.name}, ${a.location.name}${a.location.address ? ` — ${a.location.address.lines.join(', ')}` : ''}`
                  : a.type === 'HOME_VISIT'
                    ? `Home visit: ${a.visitAddress ?? ''}`
                    : 'Video consultation'}
              </dd>
            </div>
            {video ? (
              <div>
                <dt>Video link</dt>
                <dd>
                  {video.link ? (
                    <a href={video.link} target="_blank" rel="noopener noreferrer">
                      Join the video consultation
                    </a>
                  ) : !video.providerConfigured ? (
                    'No video service is connected to Toothlogy yet, so there is no link here. The clinic will send you the link for this consultation.'
                  ) : a.status === 'CONFIRMED' ? (
                    'The link will appear here shortly.'
                  ) : (
                    'The link appears here once the appointment is confirmed.'
                  )}
                </dd>
              </div>
            ) : null}
            {a.location.phone ? (
              <div>
                <dt>Clinic phone</dt>
                <dd>
                  <a href={`tel:${a.location.phone}`}>{a.location.phone}</a>
                </dd>
              </div>
            ) : null}
            {a.dependent ? (
              <div>
                <dt>For</dt>
                <dd>{a.dependent.name}</dd>
              </div>
            ) : null}
            <div>
              <dt>Payment</dt>
              <dd>At the clinic</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <PatientActions
        appointmentId={a.id}
        practiceId={a.practiceId}
        serviceOfferingId={a.serviceOfferingId}
        type={a.type}
        timezone={a.timezone}
        startsAt={a.startsAt.toISOString()}
        canCheckIn={canCheckIn}
        canAccept={canAccept}
        canCancel={canCancel}
        canReschedule={canReschedule}
        rebookHref={rebookHref}
        rebookLabel={a.status === 'COMPLETED' && a.followUpDueAt ? 'Book the follow-up' : 'Book again'}
        alternatives={alternatives}
      />

      {review && (review.canReview || review.review) ? (
        <Card label="Rate this visit">
          <CardHeader>
            <strong>{review.review ? 'Your review' : 'Rate this visit'}</strong>
          </CardHeader>
          <CardBody>
            {review.review ? (
              <p style={{ margin: 0 }}>
                <Stars rating={review.review.rating} /> {review.review.status === 'HIDDEN' ? '(hidden by a moderator)' : ''} <Link href="/account/reviews">See or change it</Link>
              </p>
            ) : (
              <ReviewForm appointmentId={a.id} />
            )}
          </CardBody>
        </Card>
      ) : null}

      <p>
        <Link href={`/account/messages?organization=${a.organizationId}&appointment=${a.id}`}>Message the practice about this appointment</Link>
      </p>

      <Card label="History">
        <CardHeader>
          <strong>History</strong>
        </CardHeader>
        <CardBody>
          <ol className="tl-list">
            {a.events.map((e) => (
              <li key={e.id}>
                <strong>{e.action.replace(/_/g, ' ').toLowerCase()}</strong>
                <span className="tl-list__meta">
                  {short(e.createdAt)} · by {e.actor === 'PATIENT' ? 'you' : e.actor === 'PRACTICE' ? 'the clinic' : 'Toothlogy'}
                  {e.reason ? ` · ${e.reason}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
