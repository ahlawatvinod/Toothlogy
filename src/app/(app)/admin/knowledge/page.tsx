/**
 * TL-PAGE-ADMIN-KNOWLEDGE-001 — /admin/knowledge
 *
 * Articles waiting for clinical review, oldest first — revisions of published
 * articles marked. 404 for anyone without the reviewer permission.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { REVIEW, reviewQueue } from '@/platform/knowledge/service';
import { ARTICLE_KIND_LABEL } from '@/platform/knowledge/labels';
import { Badge, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Articles (review)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ArticleQueuePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/knowledge');
  if (!can(principal, REVIEW)) notFound();
  const queue = await reviewQueue(principal);
  const when = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d) : '');

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Articles (review)</h1>
        <p className="tl-page__lead">Check clinical accuracy and sources before anything reaches patients. You cannot review your own.</p>
      </header>
      {queue.length === 0 ? (
        <EmptyState title="Nothing waiting" description="Articles sent for review appear here." />
      ) : (
        <ul className="tl-list" aria-label="Waiting for review">
          {queue.map((a) => (
            <li key={a.id}>
              <div className="tl-card__title-row">
                <Link href={`/admin/knowledge/${a.id}`}>
                  <strong>{a.title}</strong>
                </Link>
                <Badge tone="neutral">{ARTICLE_KIND_LABEL[a.kind]}</Badge>
                {a.publishedAt ? <Badge tone="info">revision</Badge> : null}
                {a.authorUserId === principal.userId ? <Badge tone="warning">yours</Badge> : null}
              </div>
              <span className="tl-list__meta">
                By {a.author.displayName ?? 'Dentist'} · sent {when(a.submittedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
