/**
 * TL-PAGE-ARTICLE-001 — /knowledge/:slug
 *
 * One article, as reviewed: who wrote it, who reviewed it and when, its
 * sources, and — when it explains a treatment — a way to find a dentist who
 * offers it. MedicalWebPage structured data. Drafts, unapproved revisions and
 * archived articles are not found.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getArticle } from '@/platform/knowledge/service';
import { ARTICLE_KIND_LABEL, readingMinutes } from '@/platform/knowledge/labels';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { ArticleBody } from '@/components/knowledge/article-body';
import { AiSummary } from '@/components/knowledge/ai-summary';
import { AiTranslation } from '@/components/knowledge/ai-translation';
import { RelatedArticles } from '@/components/knowledge/related-articles';
import { aiStatus, translationLanguages } from '@/platform/ai/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) return { title: 'Article not found', robots: { index: false, follow: false } };
  return { title: a.title, description: a.summary, alternates: { canonical: `/knowledge/${a.slug}` }, openGraph: { title: a.title, description: a.summary, type: 'article' } };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();
  const date = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d) : '');
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: a.title,
    description: a.summary,
    datePublished: a.publishedAt?.toISOString(),
    lastReviewed: a.reviewedAt?.toISOString(),
    author: { '@type': 'Person', name: a.author.name },
    ...(a.reviewer ? { reviewedBy: { '@type': 'Person', name: a.reviewer } } : {}),
    citation: a.citations.map((c) => ({ '@type': 'CreativeWork', name: c.title, publisher: c.source, ...(c.url ? { url: c.url } : {}) })),
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      {/* `<` escaped so text in the JSON can never close the script element. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/knowledge">Dental knowledge</Link>
      </nav>
      <article className="tl-stack" aria-label={a.title}>
        <header className="tl-page__header">
          <Badge tone="neutral">{ARTICLE_KIND_LABEL[a.kind] ?? a.kind}</Badge>
          <h1>{a.title}</h1>
          <p className="tl-page__lead">{a.summary}</p>
          <p className="tl-muted" style={{ margin: 0 }}>
            Written by {a.author.profileSlug ? <Link href={`/dentists/${a.author.profileSlug}`}>{a.author.name}</Link> : a.author.name}
            {a.reviewer ? ` · clinically reviewed by ${a.reviewer} on ${date(a.reviewedAt)}` : ''} · {readingMinutes(a.body)} min read
          </p>
        </header>
        {a.coverFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public file served by our own route
          <img src={`/api/v1/files/${a.coverFileId}/public`} alt="" style={{ width: '100%', borderRadius: 12 }} />
        ) : null}
        {/* Offered only when a model is connected: no button that can only fail. */}
        {aiStatus().configured ? <AiSummary slug={a.slug} /> : null}
        {aiStatus().configured && translationLanguages().length > 0 ? <AiTranslation slug={a.slug} languages={translationLanguages()} /> : null}
        <ArticleBody text={a.body} />
        {a.treatment ? (
          <Card label="Find a dentist">
            <CardBody>
              <p style={{ marginTop: 0 }}>Verified dentists near you who offer {a.treatment.name.toLowerCase()}.</p>
              <Link className="tl-button tl-button--primary" href={`/find?treatment=${encodeURIComponent(a.treatment.key)}`}>
                <span>Find a dentist for {a.treatment.name}</span>
              </Link>
            </CardBody>
          </Card>
        ) : null}
        {a.citations.length > 0 ? (
          <Card label="Sources">
            <CardHeader>
              <strong>Sources</strong>
            </CardHeader>
            <CardBody>
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
            </CardBody>
          </Card>
        ) : null}
        <RelatedArticles slug={a.slug} />
        <p className="tl-muted">General information, not a diagnosis or treatment plan. For your own teeth, see a dentist.</p>
      </article>
    </div>
  );
}
