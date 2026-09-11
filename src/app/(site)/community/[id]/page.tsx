/**
 * TL-PAGE-COMMUNITY-QUESTION-001 — /community/:id
 *
 * One question with its answers: the accepted answer first, then verified
 * dentists', then the rest. Signed-in members answer, report, and remove
 * their own posts; the asker accepts an answer; moderators hide or restore.
 * A hidden post is shown only to its author and moderators, with the reason.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getQuestion, topicLabel } from '@/platform/community/service';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { AnswerForm, PostActions } from './post-actions';

export const metadata: Metadata = { title: 'Community question', robots: { index: false, follow: true } };
export const dynamic = 'force-dynamic';

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  const question = await getQuestion(id, principal);
  if (!question) notFound();
  const verifiedEmail = isAuthenticated(principal) ? Boolean((await db().user.findUnique({ where: { id: principal.userId }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt) : false;
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const published = question.status === 'PUBLISHED';

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/community">Community</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/community?topic=${question.topic}`}>{topicLabel(question.topic)}</Link>
      </nav>
      {!published ? (
        <Alert tone="warning" title="Hidden">
          {question.hiddenReason ?? 'This question is hidden.'} Only you{question.viewer.moderator ? ' (as a moderator)' : ''} can see it.
        </Alert>
      ) : null}
      <article className="tl-stack" aria-labelledby="question-title">
        <header className="tl-page__header">
          <h1 id="question-title">{question.title}</h1>
          <p className="tl-page__lead">
            Asked by {question.author.name}
            {question.author.verifiedDentist ? <Badge tone="success">Verified dentist</Badge> : null} · {when(question.createdAt)}
          </p>
        </header>
        <p style={{ whiteSpace: 'pre-wrap' }}>{question.body}</p>
        {question.viewer.signedIn ? <PostActions targetType="QUESTION" targetId={question.id} mine={question.mine} moderator={question.viewer.moderator} hidden={!published} /> : null}
      </article>

      <Alert tone="info">Not medical advice. For pain, swelling, bleeding or an injury, <Link href="/find">see a dentist</Link>.</Alert>

      <Card label="Answers">
        <CardHeader>
          <strong>
            {question.answers.filter((a) => a.status === 'PUBLISHED').length} answer{question.answers.filter((a) => a.status === 'PUBLISHED').length === 1 ? '' : 's'}
          </strong>
        </CardHeader>
        <CardBody>
          {question.answers.length === 0 ? <EmptyState title="No answers yet" description="Know something that helps? Answer below." /> : null}
          <ol className="tl-list" aria-label="Answers">
            {question.answers.map((a) => (
              <li key={a.id} className="tl-stack">
                <div className="tl-card__title-row">
                  <strong>{a.author.dentistSlug ? <Link href={`/dentists/${a.author.dentistSlug}`}>{a.author.name}</Link> : a.author.name}</strong>
                  {a.author.verifiedDentist ? <Badge tone="success">Verified dentist</Badge> : null}
                  {a.accepted ? <Badge tone="info">Accepted by the asker</Badge> : null}
                  {a.status === 'HIDDEN' ? <Badge tone="warning">hidden: {a.hiddenReason}</Badge> : null}
                </div>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{a.body}</p>
                <span className="tl-list__meta">{when(a.createdAt)}</span>
                {question.viewer.signedIn ? (
                  <PostActions targetType="ANSWER" targetId={a.id} mine={a.mine} moderator={question.viewer.moderator} hidden={a.status === 'HIDDEN'} accept={question.mine && published && a.status === 'PUBLISHED' ? { questionId: question.id, accepted: a.accepted } : undefined} />
                ) : null}
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>

      {published ? (
        <Card label="Your answer">
          <CardHeader>
            <strong>Your answer</strong>
          </CardHeader>
          <CardBody>
            {!question.viewer.signedIn ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/community/${question.id}`}>Sign in</Link> to answer.
              </p>
            ) : !verifiedEmail ? (
              <p style={{ margin: 0 }}>Verify your email address first to answer.</p>
            ) : (
              <AnswerForm questionId={question.id} />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
