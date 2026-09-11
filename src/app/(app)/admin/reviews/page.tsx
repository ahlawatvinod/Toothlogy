/**
 * TL-PAGE-ADMIN-REVIEWS-001 — /admin/reviews
 *
 * Reviews practices flagged, oldest first, and reviews now hidden. Keep,
 * hide with the reason the patient is told, or restore. 404 for anyone else.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { MODERATE, reviewModerationQueue } from '@/platform/reviews/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { Stars } from '@/components/reviews/stars';
import { ReviewModeration } from './review-moderation';

export const metadata: Metadata = { title: 'Reviews (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/reviews');
  if (!can(principal, MODERATE)) notFound();
  const reviews = await reviewModerationQueue(principal);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '56rem' }}>
      <header className="tl-page__header">
        <h1>Reviews (staff)</h1>
        <p className="tl-page__lead">A practice disliking a review is not a reason to hide it. Hide what breaks the rules — abuse, private details, a review of a different practice — and say why.</p>
      </header>
      {reviews.length === 0 ? (
        <EmptyState title="Nothing waiting" description="Flagged and hidden reviews appear here." />
      ) : (
        <ul className="tl-list" aria-label="Reviews to moderate">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card label={`Review of ${r.dentistProfile.user.displayName}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>
                        {r.dentistProfile.user.displayName} · {r.organization.name}
                      </strong>
                      <Stars rating={r.rating} />
                      {r.status === 'HIDDEN' ? <Badge tone="neutral">hidden: {r.hiddenReason}</Badge> : <Badge tone="warning">flagged</Badge>}
                    </div>
                    <span className="tl-list__meta">{r.appointment.serviceName}</span>
                    {r.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p> : <p className="tl-muted" style={{ margin: 0 }}>No text, stars only.</p>}
                    {r.flagReason ? <p className="tl-muted" style={{ margin: 0 }}>Practice says: “{r.flagReason}”</p> : null}
                    <ReviewModeration reviewId={r.id} hidden={r.status === 'HIDDEN'} />
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
