/**
 * TL-PAGE-ADMIN-CAMPS-001 — /admin/camps
 *
 * Camps waiting for review, and those approved or rejected: organizer,
 * district, dates, venue, doctors and registrations. Staff approve or reject
 * with a reason — never their own camp. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { APPROVE, campsForReview } from '@/platform/camps/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { CampReview } from './camp-review';

export const metadata: Metadata = { title: 'Camps (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminCampsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/camps');
  if (!can(principal, APPROVE)) notFound();
  const camps = await campsForReview(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const waiting = camps.filter((c) => c.status === 'SUBMITTED').length;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '64rem' }}>
      <header className="tl-page__header">
        <h1>Camps (staff)</h1>
        <p className="tl-page__lead">{waiting} waiting for review. Check the venue and organizer before approving: an approved camp is listed publicly.</p>
      </header>
      {camps.length === 0 ? (
        <EmptyState title="No camps to review" description="Submitted camps appear here." />
      ) : (
        <ul className="tl-list" aria-label="Camps">
          {camps.map((c) => (
            <li key={c.id}>
              <Card label={c.title}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/account/camps/${c.id}`}>
                        <strong>{c.title}</strong>
                      </Link>
                      <Badge tone={c.status === 'SUBMITTED' ? 'info' : c.status === 'APPROVED' ? 'success' : 'danger'}>{c.status.toLowerCase()}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      {when(c.startsAt)} · {c.venueName}, {c.venueAddress} · {c.district.name}, {c.district.region.name}
                    </span>
                    <span className="tl-list__meta">
                      Organizer: {c.organizer.displayName ?? c.organizer.email}
                      {c.organization ? ` for ${c.organization.name}` : ''} · {c._count.doctors} doctors confirmed · {c._count.registrations} registrations
                    </span>
                    {c.status === 'SUBMITTED' ? <CampReview campId={c.id} own={c.organizerUserId === principal.userId} /> : null}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
