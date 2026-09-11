/**
 * TL-PAGE-MY-CAMPS-001 — /account/camps
 *
 * Participation history: camps the person organized (with their status),
 * served at as a dentist (application, decision, attendance), and attended
 * as a patient — with the referral from the visit, and the way to follow it
 * up through the ordinary callback and booking flows.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { myCamps, ORGANIZE } from '@/platform/camps/service';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { CancelRegistration, FollowUpCall, WithdrawFromCamp } from './camp-history-actions';

export const metadata: Metadata = { title: 'My camps', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = { DRAFT: 'warning', SUBMITTED: 'info', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral', COMPLETED: 'neutral' };

export default async function MyCampsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/camps');
  const { organized, serving, registrations } = await myCamps(principal);
  const canOrganize = can(principal, ORGANIZE);
  const now = new Date();
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const nothing = organized.length + serving.length + registrations.length === 0;

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My camps</h1>
        <p className="tl-page__lead">
          <Link href="/camps">Upcoming dental camps</Link>
          {canOrganize ? (
            <>
              {' · '}
              <Link href="/account/camps/new">Organize a camp</Link>
            </>
          ) : null}
        </p>
      </header>
      {nothing ? <EmptyState title="No camps yet" description="Register for a camp near you, or organize one if you run camps." /> : null}

      {registrations.length > 0 ? (
        <Card label="Camps you registered for">
          <CardHeader>
            <strong>Camps you registered for</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {registrations.map((r) => (
                <li key={r.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <Link href={`/camps/${r.camp.slug}`}>
                      <strong>{r.camp.title}</strong>
                    </Link>
                    <Badge tone={r.status === 'ATTENDED' ? 'success' : r.status === 'REGISTERED' ? 'info' : 'neutral'}>{r.status.toLowerCase().replace('_', ' ')}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {when(r.camp.startsAt)} · {r.camp.venueName}, {r.camp.district.name}
                  </span>
                  {r.findings ? <span className="tl-list__meta">The dentist noted: {r.findings}</span> : null}
                  {r.referredDentist ? (
                    <div className="tl-stack">
                      <span>
                        Follow-up with <strong>{r.referredDentist.user.displayName}</strong>.
                        {r.referredDentist.isDiscoverable ? (
                          <>
                            {' '}
                            <Link href={`/dentists/${r.referredDentist.slug}`}>Book an appointment</Link>
                          </>
                        ) : null}
                      </span>
                      {r.referredDentist.practices[0] ? <FollowUpCall practiceId={r.referredDentist.practices[0].id} dentistName={r.referredDentist.user.displayName ?? 'the dentist'} /> : null}
                    </div>
                  ) : r.needsFollowUp ? (
                    <span className="tl-list__meta">The camp advised a follow-up visit with a dentist.</span>
                  ) : null}
                  {r.status === 'REGISTERED' && r.camp.startsAt > now ? <CancelRegistration registrationId={r.id} /> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {serving.length > 0 ? (
        <Card label="Camps you serve at">
          <CardHeader>
            <strong>Camps you serve at</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {serving.map((s) => (
                <li key={s.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>{s.camp.title}</strong>
                    <Badge tone={s.status === 'APPROVED' ? 'success' : s.status === 'APPLIED' ? 'info' : 'neutral'}>{s.status.toLowerCase()}</Badge>
                    {s.attended ? <Badge tone="success">attended</Badge> : null}
                  </div>
                  <span className="tl-list__meta">
                    {when(s.camp.startsAt)} · {s.camp.venueName}, {s.camp.district.name} · camp {s.camp.status.toLowerCase()}
                    {s.decisionNote ? ` · ${s.decisionNote}` : ''}
                  </span>
                  {s.status === 'APPROVED' && s.camp.startsAt <= now ? <Link href={`/account/camps/${s.campId}`}>Camp console</Link> : null}
                  {(s.status === 'APPLIED' || s.status === 'APPROVED') && s.camp.startsAt > now ? <WithdrawFromCamp campDoctorId={s.id} /> : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {organized.length > 0 ? (
        <Card label="Camps you organize">
          <CardHeader>
            <strong>Camps you organize</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {organized.map((c) => (
                <li key={c.id}>
                  <div className="tl-card__title-row">
                    <Link href={`/account/camps/${c.id}`}>
                      <strong>{c.title}</strong>
                    </Link>
                    <Badge tone={TONE[c.status] ?? 'neutral'}>{c.status.toLowerCase()}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {when(c.startsAt)} · {c.venueName}, {c.district.name}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
