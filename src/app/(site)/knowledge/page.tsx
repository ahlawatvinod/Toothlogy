/**
 * TL-PAGE-KNOWLEDGE-001 — /knowledge
 *
 * The dental knowledge library: articles written by Toothlogy-verified
 * dentists and published only after another person's clinical review; search
 * and filter by kind. A plain GET form, so it works without JavaScript. Not
 * indexed while there is nothing to read (an empty indexed page is a doorway).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listArticles } from '@/platform/knowledge/service';
import { ARTICLE_KIND_LABEL, ARTICLE_KINDS } from '@/platform/knowledge/labels';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const dynamic = 'force-dynamic';

const DESCRIPTION = 'Plain-language explanations of dental conditions, treatments and procedures, written by verified dentists and clinically reviewed, with their sources.';

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listArticles({});
  return { title: 'Dental knowledge', description: DESCRIPTION, alternates: { canonical: '/knowledge' }, robots: total > 0 ? { index: true, follow: true } : { index: false, follow: true } };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q)?.slice(0, 100).trim() || undefined;
  const kindParam = one(sp.kind);
  const kind = ARTICLE_KINDS.some(([k]) => k === kindParam) ? (kindParam as (typeof ARTICLE_KINDS)[number][0]) : undefined;
  const page = Math.min(500, Math.max(1, Number(one(sp.page)) || 1));
  const { items, total, pages } = await listArticles({ q, kind, page });
  const date = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d) : '');
  const href = (p: number) => `/knowledge?${new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}), page: String(p) }).toString()}`;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Dental knowledge</h1>
        <p className="tl-page__lead">{DESCRIPTION} General information — for your own teeth, see a dentist.</p>
      </header>
      <form method="get" action="/knowledge" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} role="search">
        <label className="tl-stack">
          <span>Search</span>
          <input className="tl-input" type="search" name="q" defaultValue={q} maxLength={100} placeholder="e.g. root canal, sensitivity" />
        </label>
        <label className="tl-stack">
          <span>Kind</span>
          <select className="tl-input" name="kind" defaultValue={kind ?? ''}>
            <option value="">All</option>
            {ARTICLE_KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="tl-button tl-button--primary">
          <span>Search</span>
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title={q || kind ? 'Nothing matches' : 'No articles yet'}
          description={q || kind ? 'Try a different word, or all kinds.' : 'Articles appear here once a dentist has written one and a reviewer has checked it.'}
        />
      ) : (
        <ul className="tl-list" aria-label="Articles">
          {items.map((a) => (
            <li key={a.slug}>
              <Card label={a.title}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/knowledge/${a.slug}`}>
                        <strong>{a.title}</strong>
                      </Link>
                      <Badge tone="neutral">{ARTICLE_KIND_LABEL[a.kind] ?? a.kind}</Badge>
                    </div>
                    <p style={{ margin: 0 }}>{a.summary}</p>
                    <span className="tl-list__meta">
                      By {a.author} · reviewed {date(a.reviewedAt)}
                    </span>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : null}
          <span className="tl-muted">
            Page {page} of {pages} · {total} articles
          </span>
          {page < pages ? <Link href={href(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
      <p className="tl-muted">
        Have a question about your own teeth? <Link href="/community">Ask the community</Link> or <Link href="/find">find a dentist</Link>.
      </p>
    </div>
  );
}
