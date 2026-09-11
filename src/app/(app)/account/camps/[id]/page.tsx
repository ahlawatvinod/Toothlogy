/**
 * TL-PAGE-CAMP-CONSOLE-001 — /account/camps/:id
 *
 * The camp console for its organizer, Toothlogy staff and the camp's
 * confirmed doctors: status and review note, the numbers (registered,
 * attended, walk-ins, follow-ups, referrals, and the leads and appointments
 * attributed to the camp), doctors' applications and attendance, and the
 * patients — with visit recording and walk-in registration. 404 for anyone
 * else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { campConsole } from '@/platform/camps/service';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { CampStatusActions, DoctorDecision, VisitForm, WalkInForm } from './camp-console-actions';

export const metadata: Metadata = { title: 'Camp', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CampConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await campConsole(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { camp, viewer, stats } = data;
  const now = new Date();
  const runs = viewer.organizer || viewer.staff;
  const started = camp.startsAt <= now;
  const live = camp.status === 'APPROVED' || camp.status === 'COMPLETED';
  const approvedDoctors = camp.doctors.filter((d) => d.status === 'APPROVED').map((d) => ({ id: d.dentistProfile.id, name: d.dentistProfile.user.displayName ?? 'Dentist' }));
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: camp.timezone }).format(d);
  const tiles: Array<[string, number]> = [
    ['Registered', stats.registered],
    ['Attended', stats.attended],
    ['Did not come', stats.noShow],
    ['Walk-ins', stats.walkIns],
    ['Need follow-up', stats.followUps],
    ['Referred to a camp doctor', stats.referrals],
    ['Leads from the camp', stats.leads],
    ['Appointments from the camp', stats.appointments],
  ];

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/camps">My camps</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{camp.title}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{camp.title}</h1>
          <Badge tone={camp.status === 'APPROVED' ? 'success' : camp.status === 'REJECTED' ? 'danger' : camp.status === 'SUBMITTED' ? 'info' : 'neutral'}>{camp.status.toLowerCase()}</Badge>
        </div>
        <p className="tl-page__lead">
          {when(camp.startsAt)} – {when(camp.endsAt)} · {camp.venueName}, {camp.district.name}, {camp.district.region.name}
          {camp.status === 'APPROVED' || camp.status === 'COMPLETED' ? (
            <>
              {' · '}
              <Link href={`/camps/${camp.slug}`}>Public page</Link>
            </>
          ) : null}
        </p>
      </header>

      {camp.reviewNote ? (
        <Card label="Review">
          <CardBody>
            <p style={{ margin: 0 }}>
              {camp.status === 'REJECTED' ? 'Not approved: ' : camp.status === 'CANCELLED' ? 'Cancelled: ' : 'Note: '}
              {camp.reviewNote}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {runs ? <CampStatusActions campId={camp.id} status={camp.status} isOrganizer={viewer.organizer} isStaff={viewer.staff} started={started} /> : null}

      <Card label="Numbers">
        <CardBody>
          <dl className="tl-kv">
            {tiles.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="tl-muted">Leads and appointments are counted when a patient referred at this camp asks the doctor to call or books with them within 90 days.</p>
        </CardBody>
      </Card>

      <Card label="Doctors">
        <CardHeader>
          <strong>Doctors</strong>
        </CardHeader>
        <CardBody>
          {camp.doctors.length === 0 ? (
            <EmptyState title="No applications yet" description="Verified dentists apply from the camp’s public page once it is submitted." />
          ) : (
            <ul className="tl-list">
              {camp.doctors.map((d) => (
                <li key={d.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>{d.dentistProfile.user.displayName}</strong>
                    <Badge tone={d.status === 'APPROVED' ? 'success' : d.status === 'APPLIED' ? 'info' : 'neutral'}>{d.status.toLowerCase()}</Badge>
                    {d.attended ? <Badge tone="success">attended</Badge> : null}
                  </div>
                  {d.message ? <span className="tl-list__meta">“{d.message}”</span> : null}
                  {runs ? <DoctorDecision campDoctorId={d.id} status={d.status} started={started} attended={d.attended} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {live ? (
        <Card label="Patients">
          <CardHeader>
            <strong>Patients</strong>
          </CardHeader>
          <CardBody>
            {camp.status === 'APPROVED' ? <WalkInForm campId={camp.id} /> : null}
            {camp.registrations.length === 0 ? (
              <EmptyState title="No patients yet" description="Registrations appear here as patients sign up or are recorded at the venue." />
            ) : (
              <ul className="tl-list" aria-label="Patients">
                {camp.registrations.map((r) => (
                  <li key={r.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{r.name}</strong>
                      <Badge tone={r.status === 'ATTENDED' ? 'success' : r.status === 'REGISTERED' ? 'info' : 'neutral'}>{r.status.toLowerCase().replace('_', ' ')}</Badge>
                      {r.source === 'WALK_IN' ? <Badge tone="neutral">walk-in</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      <a href={`tel:${r.phone}`}>{r.phone}</a>
                      {r.age !== null ? ` · ${r.age} years` : ''}
                      {r.concern ? ` · “${r.concern}”` : ''}
                    </span>
                    {r.findings || r.referredDentist ? (
                      <span className="tl-list__meta">
                        {r.findings ?? ''}
                        {r.referredDentist ? ` · referred to ${r.referredDentist.user.displayName}` : r.needsFollowUp ? ' · needs follow-up' : ''}
                        {r.seenBy ? ` · seen by ${r.seenBy.user.displayName}` : ''}
                      </span>
                    ) : null}
                    {started && r.status !== 'CANCELLED' ? <VisitForm registrationId={r.id} doctors={approvedDoctors} findings={r.findings ?? ''} needsFollowUp={r.needsFollowUp} referredDentistProfileId={r.referredDentistProfileId} /> : null}
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
