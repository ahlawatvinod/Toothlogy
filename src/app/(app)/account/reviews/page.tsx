/**
 * TL-PAGE-MY-REVIEWS-001 — /account/reviews
 *
 * The patient's reviews with the practices' replies; change one for 30 days,
 * or remove it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { EDIT_WINDOW_DAYS, myReviews } from '@/platform/reviews/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { Stars } from '@/components/reviews/stars';
import { MyReviewActions } from './my-review-actions';

export const metadata: Metadata = { title: 'My reviews', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyReviewsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/reviews');
  const reviews = await myReviews(principal);
  const now = new Date().getTime();
  const month = (d: Date) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My reviews</h1>
        <p className="tl-page__lead">
          Reviews of your visits. Rate a visit from its page under <Link href="/account/appointments">Appointments</Link> once it has taken place.
        </p>
      </header>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" description="After a visit, you can rate it from the appointment’s page." />
      ) : (
        <ul className="tl-list" aria-label="My reviews">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card label={`Review of ${r.dentistProfile.user.displayName ?? 'your dentist'}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{r.dentistProfile.isDiscoverable ? <Link href={`/dentists/${r.dentistProfile.slug}`}>{r.dentistProfile.user.displayName}</Link> : r.dentistProfile.user.displayName}</strong>
                      <Stars rating={r.rating} />
                      {r.status === 'HIDDEN' ? <Badge tone="warning">hidden: {r.hiddenReason}</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {r.appointment.serviceName} · visit in {month(r.appointment.startsAt)}
                      {r.editedAt ? ' · edited' : ''}
                    </span>
                    {r.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p> : null}
                    {r.response ? <p className="tl-muted" style={{ margin: 0 }}>The practice replied: “{r.response.body}”</p> : null}
                    <MyReviewActions reviewId={r.id} rating={r.rating} body={r.body ?? ''} canEdit={r.status === 'PUBLISHED' && r.createdAt.getTime() > now - EDIT_WINDOW_DAYS * 86_400_000} />
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
