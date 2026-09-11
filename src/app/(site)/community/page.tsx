/**
 * TL-PAGE-COMMUNITY-001 — /community
 *
 * Questions and answers about teeth, dental studies and practice, by topic,
 * unanswered first if asked, searchable. Not medical advice, and it says so.
 * Not indexed: unreviewed health advice should not rank in search engines.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { COMMUNITY_TOPICS, listQuestions, topicLabel } from '@/platform/community/service';
import { Alert, Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Dental community', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

export default async function CommunityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const topic = typeof sp.topic === 'string' && COMMUNITY_TOPICS.some((t) => t.key === sp.topic) ? sp.topic : undefined;
  const unanswered = sp.unanswered === '1';
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 80) : undefined;
  const questions = await listQuestions({ topic, unanswered, q });
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ topic, unanswered: unanswered ? '1' : undefined, q, ...next })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/community?${s}` : '/community';
  };

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Dental community</h1>
        <p className="tl-page__lead">
          Ask about your teeth, dental studies or running a practice, and answer what you know. <Link href="/community/ask">Ask a question</Link>
        </p>
      </header>
      <Alert tone="info" title="Not medical advice">
        Answers here come from members — some are verified dentists, marked as such — and cannot replace an examination. For pain, swelling, bleeding or an injury, <Link href="/find">see a dentist</Link>.
      </Alert>

      <form action="/community" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} role="search">
        <label className="tl-field">
          <span className="tl-field__label">Search questions</span>
          <input className="tl-input" type="search" name="q" defaultValue={q ?? ''} maxLength={80} />
        </label>
        {topic ? <input type="hidden" name="topic" value={topic} /> : null}
        <button type="submit" className="tl-button tl-button--md tl-button--primary">
          <span>Search</span>
        </button>
      </form>
      <nav aria-label="Topic" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href={href({ topic: undefined })} aria-current={!topic ? 'page' : undefined} className={`tl-button tl-button--sm ${!topic ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>All topics</span>
        </Link>
        {COMMUNITY_TOPICS.map((t) => (
          <Link key={t.key} href={href({ topic: t.key })} aria-current={topic === t.key ? 'page' : undefined} className={`tl-button tl-button--sm ${topic === t.key ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>{t.label}</span>
          </Link>
        ))}
        {/* A link, not a toggle button: aria-pressed is not allowed on links (axe, critical); the active filter is marked current. */}
        <Link href={href({ unanswered: unanswered ? undefined : '1' })} aria-current={unanswered ? 'true' : undefined} className={`tl-button tl-button--sm ${unanswered ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>Unanswered</span>
        </Link>
      </nav>

      {questions.length === 0 ? (
        <EmptyState title="No questions here yet" description="Be the first to ask." />
      ) : (
        <ul className="tl-list" aria-label="Questions">
          {questions.map((question) => (
            <li key={question.id}>
              <Card label={question.title}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/community/${question.id}`}>
                        <strong>{question.title}</strong>
                      </Link>
                      {question.accepted ? <Badge tone="success">answered</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {topicLabel(question.topic)} · {question.answers} answer{question.answers === 1 ? '' : 's'} · asked by {question.author.name}
                      {question.author.verifiedDentist ? ' (verified dentist)' : ''} · {when(question.createdAt)}
                    </span>
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
