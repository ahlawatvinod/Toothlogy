/**
 * TL-PAGE-MY-ARTICLES-001 — /account/articles
 *
 * A verified dentist's articles — drafts, with a reviewer, changes requested,
 * published, archived — and a new one. Dentists not yet verified are told why
 * they cannot write yet; anyone without the permission gets a 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { myArticles, WRITE } from '@/platform/knowledge/service';
import { ARTICLE_KIND_LABEL, ARTICLE_STATUS_LABEL } from '@/platform/knowledge/labels';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { ArticleEditor } from '@/components/knowledge/article-editor';

export const metadata: Metadata = { title: 'My articles', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyArticlesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/articles');
  if (!can(principal, WRITE)) notFound();
  const [articles, verified, treatments] = await Promise.all([
    myArticles(principal),
    db().dentistProfile.count({ where: { userId: principal.userId, isVerified: true, deletedAt: null } }),
    db().treatment.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } }),
  ]);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My articles</h1>
        <p className="tl-page__lead">
          Explain a condition, treatment or procedure for patients, or write a blog post. Another dentist reviews every article before it appears in <Link href="/knowledge">Dental knowledge</Link>.
        </p>
      </header>
      {articles.length === 0 ? (
        <EmptyState title="No articles yet" description={verified ? 'Start one below.' : 'You can write once Toothlogy has verified your credentials.'} />
      ) : (
        <ul className="tl-list" aria-label="My articles">
          {articles.map((a) => (
            <li key={a.id}>
              <div className="tl-card__title-row">
                <Link href={`/account/articles/${a.id}`}>
                  <strong>{a.title}</strong>
                </Link>
                <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'CHANGES_REQUESTED' ? 'warning' : 'neutral'}>{ARTICLE_STATUS_LABEL[a.status] ?? a.status}</Badge>
                {a.liveTitle && a.status !== 'PUBLISHED' && a.status !== 'ARCHIVED' ? <Badge tone="info">live version up</Badge> : null}
              </div>
              <span className="tl-list__meta">
                {ARTICLE_KIND_LABEL[a.kind]} · updated {date(a.updatedAt)}
                {a.liveTitle && a.status !== 'ARCHIVED' ? (
                  <>
                    {' · '}
                    <Link href={`/knowledge/${a.slug}`}>read it on Toothlogy</Link>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {verified ? (
        <Card label="Start an article">
          <CardHeader>
            <strong>Start an article</strong>
          </CardHeader>
          <CardBody>
            <ArticleEditor
              initial={{ kind: 'CONDITION', title: '', summary: '', body: '', citations: [], treatmentKey: '', specialtyKey: '', coverFileId: '', published: false, canSubmit: false, archived: false }}
              treatments={treatments}
              specialties={DENTAL_SPECIALTIES.map((s) => ({ key: s.key, name: s.name }))}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
