/**
 * TL-PAGE-PRACTICE-REVIEWS-001 — /account/practice/reviews
 *
 * Reviews of the practices the person answers for, and of themselves as a
 * dentist: rating, visit, reply (one, editable) and flag for a moderator.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { practiceReviews, publicName } from '@/platform/reviews/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { Stars } from '@/components/reviews/stars';
import { ReviewReply } from './review-reply';

export const metadata: Metadata = { title: 'Reviews', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PracticeReviewsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice/reviews');
  const reviews = await practiceReviews(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Reviews</span>
      </nav>
      <header className="tl-page__header">
        <h1>Reviews</h1>
        <p className="tl-page__lead">Every review here follows a visit that took place. Reply once, in public; if a review breaks the rules, flag it for a moderator — it stays up until they decide.</p>
      </header>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" description="Patients can review a visit once it is marked completed." />
      ) : (
        <ul className="tl-list" aria-label="Reviews">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card label={`Review by ${publicName(r.patient.displayName)}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{publicName(r.patient.displayName)}</strong>
                      <Stars rating={r.rating} />
                      {r.status === 'HIDDEN' ? <Badge tone="neutral">hidden by a moderator</Badge> : null}
                      {r.flaggedAt ? <Badge tone="warning">flagged</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {r.appointment.serviceName} with {r.dentistProfile.user.displayName} at {r.organization.name} · {when(r.createdAt)}
                      {r.editedAt ? ' · edited' : ''}
                    </span>
                    {r.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p> : null}
                    {r.response ? <p className="tl-muted" style={{ margin: 0 }}>Your reply: “{r.response.body}”</p> : null}
                    {r.status === 'PUBLISHED' ? <ReviewReply reviewId={r.id} reply={r.response?.body ?? ''} flagged={r.flaggedAt !== null} /> : null}
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
