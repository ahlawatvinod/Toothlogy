/**
 * TL-PAGE-ADMIN-COMMUNITY-001 — /admin/community
 *
 * Open reports, oldest first, with what was reported; and what is hidden,
 * with the reason. Moderators hide (with a reason the author sees) or
 * restore. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { MODERATE, moderationQueue } from '@/platform/community/service';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { PostActions } from '../../../(site)/community/[id]/post-actions';

export const metadata: Metadata = { title: 'Community (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminCommunityPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/community');
  if (!can(principal, MODERATE)) notFound();
  const { reports, hiddenQuestions, hiddenAnswers } = await moderationQueue(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '56rem' }}>
      <header className="tl-page__header">
        <h1>Community (staff)</h1>
        <p className="tl-page__lead">Hide what breaks the rules — spam, abuse, dangerous health claims, private details — and say why. Restore what does not.</p>
      </header>

      <Card label="Open reports">
        <CardHeader>
          <strong>Open reports ({reports.length})</strong>
        </CardHeader>
        <CardBody>
          {reports.length === 0 ? (
            <EmptyState title="No open reports" description="Nothing is waiting." />
          ) : (
            <ul className="tl-list" aria-label="Open reports">
              {reports.map((r) => {
                const questionId = r.question?.id ?? r.answer?.question.id;
                const title = r.question?.title ?? r.answer?.question.title ?? '';
                const body = r.question?.body ?? r.answer?.body ?? '';
                const status = r.question?.status ?? r.answer?.status ?? 'PUBLISHED';
                return (
                  <li key={r.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{r.targetType === 'QUESTION' ? 'Question' : 'Answer'}</strong>
                      <Badge tone="warning">{r.reason.toLowerCase()}</Badge>
                      {status === 'HIDDEN' ? <Badge tone="neutral">hidden</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      In <Link href={`/community/${questionId}`}>{title}</Link> · reported {when(r.createdAt)}
                      {r.note ? ` · “${r.note}”` : ''}
                    </span>
                    <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{body.slice(0, 600)}</p>
                    <PostActions targetType={r.targetType} targetId={(r.questionId ?? r.answerId)!} mine={false} moderator hidden={status === 'HIDDEN'} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card label="Hidden posts">
        <CardHeader>
          <strong>Hidden posts</strong>
        </CardHeader>
        <CardBody>
          {hiddenQuestions.length + hiddenAnswers.length === 0 ? (
            <EmptyState title="Nothing hidden" description="Hidden posts appear here with their reason." />
          ) : (
            <ul className="tl-list" aria-label="Hidden posts">
              {hiddenQuestions.map((q) => (
                <li key={q.id} className="tl-stack">
                  <span>
                    Question <Link href={`/community/${q.id}`}>{q.title}</Link> — {q.hiddenReason}
                  </span>
                  <PostActions targetType="QUESTION" targetId={q.id} mine={false} moderator hidden />
                </li>
              ))}
              {hiddenAnswers.map((a) => (
                <li key={a.id} className="tl-stack">
                  <span>
                    Answer in <Link href={`/community/${a.question.id}`}>{a.question.title}</Link> — {a.hiddenReason}
                  </span>
                  <PostActions targetType="ANSWER" targetId={a.id} mine={false} moderator hidden />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
