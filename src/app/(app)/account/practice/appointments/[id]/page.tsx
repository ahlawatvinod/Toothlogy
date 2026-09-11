/**
 * TL-PAGE-PRACTICE-APPOINTMENT-001 — /account/practice/appointments/:id
 *
 * One appointment from the practice's side, with the patient's contact
 * details — shown here because this appointment is the practice's, and
 * nowhere else. The patient following a link here is sent to their own view;
 * anyone else gets a 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getAppointment } from '@/platform/appointments/service';
import { isAppError } from '@/platform/kernel/errors';
import { videoMeetingView } from '@/platform/video/service';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { PRACTICE_STATUS_LABELS, TYPE_LABELS } from '@/components/booking/status';
import { PracticeActions } from '../../practice-actions';
import { allowedPracticeActions } from '../../allowed';

export const metadata: Metadata = { title: 'Appointment', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PracticeAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/practice/appointments/${id}`);

  let loaded;
  try {
    loaded = await getAppointment(principal, id);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  if (loaded.actor === 'PATIENT') redirect(`/account/appointments/${id}`);
  const a = loaded.appointment;

  const user = await db().user.findUnique({ where: { id: principal.userId }, select: { locale: true } });
  const locale = user?.locale ?? 'en-IN';
  const full = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short', timeZone: a.timezone }).format(d);
  const short = (d: Date) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: a.timezone }).format(d);
  const status = PRACTICE_STATUS_LABELS[a.status] ?? { label: a.status, tone: 'neutral' as const };
  const video = a.type === 'VIDEO' ? await videoMeetingView(a.id, 'PRACTICE') : null;

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{short(a.startsAt)}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{full(a.startsAt)}</h1>
          <Badge tone={status.tone}>{status.label}</Badge>
          {a.isEmergency ? <Badge tone="danger">Emergency</Badge> : null}
        </div>
        <p className="tl-page__lead">
          {a.serviceName} · {TYPE_LABELS[a.type] ?? a.type} · {a.dentistProfile.user.displayName ?? 'Dentist'} · {a.location.name}
        </p>
      </header>

      <Card label="Patient">
        <CardHeader>
          <strong>Patient</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Name</dt>
              <dd>{a.dependent ? `${a.dependent.name} (${a.dependent.relationship.toLowerCase()} of ${a.patient.displayName ?? 'the account holder'})` : (a.patient.displayName ?? 'Patient')}</dd>
            </div>
            {a.patient.phone ? (
              <div>
                <dt>Phone</dt>
                <dd>
                  <a href={`tel:${a.patient.phone}`}>{a.patient.phone}</a>
                </dd>
              </div>
            ) : null}
            {a.patient.email ? (
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${a.patient.email}`}>{a.patient.email}</a>
                </dd>
              </div>
            ) : null}
            {a.patientNote ? (
              <div>
                <dt>Note</dt>
                <dd>{a.patientNote}</dd>
              </div>
            ) : null}
            {video ? (
              <div>
                <dt>Video link</dt>
                <dd>
                  {video.link ? (
                    <a href={video.link} target="_blank" rel="noopener noreferrer">
                      Open the video consultation (host)
                    </a>
                  ) : !video.providerConfigured ? (
                    'No video service is connected to Toothlogy, so there is no meeting link. Send the patient your own link.'
                  ) : (
                    'The meeting is created once the appointment is confirmed.'
                  )}
                </dd>
              </div>
            ) : null}
            {a.visitAddress ? (
              <div>
                <dt>Visit address</dt>
                <dd>{a.visitAddress}</dd>
              </div>
            ) : null}
            <div>
              <dt>Booked</dt>
              <dd>
                {a.mode === 'INSTANT' ? 'Instant booking' : 'Request'} via {a.source.toLowerCase().replace('_', ' ')}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {can(principal, 'tl.records.record.read', { organizationId: a.organizationId }) ? (
        <p>
          <Link href={`/account/organizations/${a.organizationId}/patients/${a.patientUserId}`}>Patient’s dental record</Link>
          <span className="tl-muted"> — if they have shared it with you; otherwise ask them from Patients’ records.</span>
        </p>
      ) : null}

      <Card label="Actions">
        <CardBody>
          <PracticeActions
            appointmentId={a.id}
            practiceId={a.practiceId}
            serviceOfferingId={a.serviceOfferingId}
            type={a.type}
            timezone={a.timezone}
            startsAt={a.startsAt.toISOString()}
            allowed={allowedPracticeActions(a)}
          />
          {!Object.values(allowedPracticeActions(a)).some(Boolean) ? <p className="tl-muted" style={{ margin: 0 }}>No actions: this appointment is closed.</p> : null}
        </CardBody>
      </Card>

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
                  {short(e.createdAt)} · {e.actor.toLowerCase()}
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
