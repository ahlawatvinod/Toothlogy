/**
 * TL-PAGE-CAMP-001 — /camps/:slug
 *
 * An approved (or completed) camp: when, where, what is offered, the
 * confirmed dentists, places left; registration for signed-in patients and
 * an application for verified dentists. The form says what is needed
 * instead of failing on submit.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicCamp } from '@/platform/camps/service';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { ApplyAsDoctor, RegisterForCamp } from './camp-signup';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const camp = await getPublicCamp((await params).slug);
  if (!camp) return { title: 'Camp not found', robots: { index: false, follow: false } };
  return { title: camp.title, description: `Dental camp at ${camp.venueName}, ${camp.district.name}.` };
}

export default async function CampPage({ params }: { params: Promise<{ slug: string }> }) {
  const camp = await getPublicCamp((await params).slug);
  if (!camp) notFound();
  const principal = await currentPrincipal();
  const now = new Date();
  const open = camp.status === 'APPROVED' && camp.endsAt > now;
  const viewer = isAuthenticated(principal)
    ? await (async () => {
        const [user, profile, registration] = await Promise.all([
          db().user.findUnique({ where: { id: principal.userId }, select: { phone: true } }),
          db().dentistProfile.findUnique({ where: { userId: principal.userId }, select: { id: true, isVerified: true, verificationExpiresAt: true } }),
          db().campRegistration.findFirst({ where: { campId: camp.id, patientUserId: principal.userId, status: { not: 'CANCELLED' } }, select: { id: true } }),
        ]);
        const application = profile ? await db().campDoctor.findUnique({ where: { campId_dentistProfileId: { campId: camp.id, dentistProfileId: profile.id } }, select: { status: true } }) : null;
        const verified = Boolean(profile?.isVerified && (!profile.verificationExpiresAt || profile.verificationExpiresAt > now));
        return { phone: user?.phone ?? '', isDentist: Boolean(profile), verified, registered: Boolean(registration), application: application?.status ?? null, organizer: camp.organizerUserId === principal.userId };
      })()
    : null;
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: camp.timezone }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: camp.timezone }).format(d);

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/camps">Dental camps</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{camp.title}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{camp.title}</h1>
          {camp.status === 'COMPLETED' ? <Badge tone="neutral">Held</Badge> : camp.seatsLeft === 0 ? <Badge tone="warning">Full</Badge> : <Badge tone="success">Open</Badge>}
        </div>
        <p className="tl-page__lead">
          {when(camp.startsAt)} – {time(camp.endsAt)} · {camp.venueName}, {camp.district.name}, {camp.district.region.name}
        </p>
      </header>

      <Card label="About this camp">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Venue</dt>
              <dd>
                {camp.venueName}
                <div className="tl-muted">{camp.venueAddress}</div>
              </dd>
            </div>
            <div>
              <dt>Organized by</dt>
              <dd>{camp.organization?.name ?? camp.organizer.displayName ?? 'A Toothlogy organizer'}</dd>
            </div>
            {camp.services ? (
              <div>
                <dt>Offered</dt>
                <dd>{camp.services}</dd>
              </div>
            ) : null}
            <div>
              <dt>Places</dt>
              <dd>{camp.seatsLeft === null ? 'No fixed limit' : `${camp.seatsLeft} of ${camp.capacity} left`}</dd>
            </div>
          </dl>
          {camp.description ? <p>{camp.description}</p> : null}
        </CardBody>
      </Card>

      <Card label="Dentists serving">
        <CardHeader>
          <strong>Dentists serving</strong>
        </CardHeader>
        <CardBody>
          {camp.doctors.length === 0 ? (
            <EmptyState title="No dentists confirmed yet" description="Verified dentists are confirmed by the organizer before the camp." />
          ) : (
            <ul className="tl-list">
              {camp.doctors.map((d) => (
                <li key={d.dentistProfile.id}>
                  {d.dentistProfile.isDiscoverable ? <Link href={`/dentists/${d.dentistProfile.slug}`}>{d.dentistProfile.user.displayName}</Link> : d.dentistProfile.user.displayName} <Badge tone="success">Verified</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {open ? (
        <Card label="Take part">
          <CardHeader>
            <strong>Take part</strong>
          </CardHeader>
          <CardBody>
            {!viewer ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/camps/${camp.slug}`}>Sign in</Link> or <Link href="/register">create an account</Link> to register for this camp.
              </p>
            ) : viewer.organizer ? (
              <p style={{ margin: 0 }}>
                You organize this camp. <Link href={`/account/camps/${camp.id}`}>Open the camp console</Link>.
              </p>
            ) : viewer.isDentist ? (
              viewer.application ? (
                <p style={{ margin: 0 }}>Your application to serve: {viewer.application.toLowerCase()}. See it under <Link href="/account/camps">My camps</Link>.</p>
              ) : viewer.verified ? (
                <ApplyAsDoctor campId={camp.id} />
              ) : (
                <p style={{ margin: 0 }}>Only verified dentists can serve at camps. <Link href="/account/dentist-profile">Complete your verification</Link>.</p>
              )
            ) : viewer.registered ? (
              <p style={{ margin: 0 }}>
                You are registered. See it under <Link href="/account/camps">My camps</Link>.
              </p>
            ) : camp.seatsLeft === 0 ? (
              <p style={{ margin: 0 }}>This camp is full.</p>
            ) : (
              <RegisterForCamp campId={camp.id} defaultPhone={viewer.phone} />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
