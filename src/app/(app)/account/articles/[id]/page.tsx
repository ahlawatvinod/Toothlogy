/**
 * TL-PAGE-ARTICLE-EDIT-001 — /account/articles/:id
 *
 * The author's working copy: edit, send for review, archive; the reviewer's
 * note when changes were requested. A reviewer following a link here is sent
 * to the review page; anyone else gets a 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { articleForEditing } from '@/platform/knowledge/service';
import { ARTICLE_STATUS_LABEL } from '@/platform/knowledge/labels';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge } from '@/design-system';
import { ArticleEditor } from '@/components/knowledge/article-editor';

export const metadata: Metadata = { title: 'Edit article', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/articles/${id}`);
  const loaded = await articleForEditing(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  if (!loaded.isAuthor) redirect(`/admin/knowledge/${id}`);
  const { article: a } = loaded;
  const treatments = await db().treatment.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } });

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/articles">My articles</Link>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{a.title}</h1>
          <Badge tone={a.status === 'PUBLISHED' ? 'success' : a.status === 'CHANGES_REQUESTED' ? 'warning' : 'neutral'}>{ARTICLE_STATUS_LABEL[a.status] ?? a.status}</Badge>
        </div>
        {a.liveTitle && a.status !== 'ARCHIVED' ? (
          <p className="tl-page__lead">
            Readers see the reviewed version: <Link href={`/knowledge/${a.slug}`}>open it</Link>.
            {a.status !== 'PUBLISHED' ? ' Your changes here are not public until a reviewer approves them.' : ''}
          </p>
        ) : null}
      </header>
      {a.status === 'CHANGES_REQUESTED' && a.reviewNote ? <Alert tone="warning">The reviewer asked for changes: {a.reviewNote}</Alert> : null}
      {a.status === 'IN_REVIEW' ? <Alert tone="info">With a reviewer. Editing it takes it back to draft; send it again when ready.</Alert> : null}
      {a.status === 'ARCHIVED' ? <Alert tone="info">Archived: {a.archivedReason}</Alert> : null}
      <ArticleEditor
        initial={{
          id: a.id,
          kind: a.kind,
          title: a.title,
          summary: a.summary,
          body: a.body,
          citations: a.citations,
          treatmentKey: a.treatment?.key ?? '',
          specialtyKey: a.specialtyKey ?? '',
          coverFileId: a.coverFileId ?? '',
          published: Boolean(a.publishedAt),
          canSubmit: a.status !== 'PUBLISHED' && a.status !== 'ARCHIVED',
          archived: a.status === 'ARCHIVED',
        }}
        treatments={treatments}
        specialties={DENTAL_SPECIALTIES.map((s) => ({ key: s.key, name: s.name }))}
      />
    </div>
  );
}
