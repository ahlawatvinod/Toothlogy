/**
 * TL-PAGE-ARTICLE-REVIEW-001 — /admin/knowledge/:id
 *
 * The working copy as readers would see it, with its sources and the treatment
 * it explains; publish, request changes, or archive. The author is told
 * someone else must review it. 404 for anyone without the reviewer permission.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { articleForEditing, REVIEW } from '@/platform/knowledge/service';
import { ARTICLE_KIND_LABEL, ARTICLE_STATUS_LABEL } from '@/platform/knowledge/labels';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/design-system';
import { ArticleBody } from '@/components/knowledge/article-body';
import { ReviewForm } from '@/components/knowledge/review-form';

export const metadata: Metadata = { title: 'Review article', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ReviewArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/admin/knowledge/${id}`);
  if (!can(principal, REVIEW)) notFound();
  const loaded = await articleForEditing(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  const { article: a, isAuthor, canReview } = loaded;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/admin/knowledge">Articles (review)</Link>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <Badge tone="neutral">{ARTICLE_KIND_LABEL[a.kind]}</Badge>
          <Badge tone={a.status === 'IN_REVIEW' ? 'info' : 'neutral'}>{ARTICLE_STATUS_LABEL[a.status]}</Badge>
          {a.publishedAt ? <Badge tone="info">revision of a published article</Badge> : null}
        </div>
        <h1>{a.title}</h1>
        <p className="tl-page__lead">{a.summary}</p>
        <p className="tl-muted" style={{ margin: 0 }}>
          By {a.author.displayName ?? 'Dentist'}
          {a.treatment ? ` · explains ${a.treatment.name}` : ''}
        </p>
      </header>
      {isAuthor ? <Alert tone="warning">This is your article. Someone else reviews it.</Alert> : null}
      <Card label="Text">
        <CardBody>
          <ArticleBody text={a.body} />
        </CardBody>
      </Card>
      <Card label="Sources">
        <CardHeader>
          <strong>Sources</strong>
        </CardHeader>
        <CardBody>
          {a.citations.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              None given.
            </p>
          ) : (
            <ol aria-label="Sources">
              {a.citations.map((c, i) => (
                <li key={i}>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="nofollow noopener noreferrer">
                      {c.title}
                    </a>
                  ) : (
                    c.title
                  )}
                  . <em>{c.source}</em>
                  {c.year ? `, ${c.year}` : ''}.
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
      <Card label="Decision">
        <CardHeader>
          <strong>Decision</strong>
        </CardHeader>
        <CardBody>
          <ReviewForm articleId={a.id} canReview={canReview} canArchive={!isAuthor && a.status !== 'ARCHIVED'} />
          {!canReview && !isAuthor ? <p className="tl-muted">Not waiting for review ({ARTICLE_STATUS_LABEL[a.status]?.toLowerCase()}).</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
