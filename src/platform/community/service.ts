/**
 * TOOTHLOGY COMMUNITY — questions and answers
 *
 * People ask about their teeth, students about their studies, dentists about
 * practice; anyone signed in with a verified email may ask and answer.
 *
 * - Not medical advice: the pages say so, and that pain, swelling or
 *   bleeding needs a dentist, not a forum.
 * - Public posts may not carry phone numbers or email addresses — they are
 *   refused, not silently edited.
 * - Answers from verified dentists carry a badge; the asker may accept one.
 * - Limits: 5 questions and 30 answers a day per person.
 * - Authors remove their own posts (the text is cleared, not just hidden).
 *   Anyone signed in may report a post once; three reports hide it pending a
 *   moderator; moderators hide (with a reason) or restore, and the author is
 *   told.
 */

import { z } from 'zod';
import { Prisma, type CommunityTarget } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { containsContactDetails } from '../../lib/contact-details';

export const MODERATE = 'tl.community.post.moderate';
const DAY = 86_400_000;
const QUESTIONS_PER_DAY = 5;
const ANSWERS_PER_DAY = 30;
/** Distinct open reports that hide a post until a moderator looks at it. */
export const AUTO_HIDE_REPORTS = 3;

export const COMMUNITY_TOPICS = [
  { key: 'general', label: 'General' },
  { key: 'pain', label: 'Tooth pain and sensitivity' },
  { key: 'gums', label: 'Gums' },
  { key: 'children', label: 'Children’s teeth' },
  { key: 'braces', label: 'Braces and aligners' },
  { key: 'implants', label: 'Implants, crowns and dentures' },
  { key: 'cosmetic', label: 'Whitening and cosmetic' },
  { key: 'hygiene', label: 'Brushing and oral hygiene' },
  { key: 'students', label: 'Dental students' },
  { key: 'practice', label: 'Running a practice' },
] as const;
const TOPIC_KEYS = new Set<string>(COMMUNITY_TOPICS.map((t) => t.key));
export const topicLabel = (key: string) => COMMUNITY_TOPICS.find((t) => t.key === key)?.label ?? key;

/** Phone numbers and email addresses have no place in a public post. */
function noContact(value: string, field: string) {
  if (containsContactDetails(value)) throw errors.validation('Do not share phone numbers or email addresses in public posts. Use Toothlogy to book or ask a dentist to call.', { field });
}

async function verifiedAuthor(principal: Principal): Promise<AuthenticatedPrincipal> {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const user = await db().user.findUnique({ where: { id: principal.userId }, select: { status: true, emailVerifiedAt: true } });
  if (!user || user.status !== 'ACTIVE') throw errors.unauthenticated();
  if (!user.emailVerifiedAt) throw errors.preconditionFailed('Verify your email address first.');
  return principal;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export const questionSchema = z.object({
  topic: z.string().max(40),
  title: z.string().trim().min(10, 'Ask your question in at least 10 characters.').max(160),
  body: z.string().trim().min(20, 'Add a little detail: at least 20 characters.').max(5000),
});

export async function askQuestion(principal: Principal, raw: z.input<typeof questionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = await verifiedAuthor(principal);
  const input = questionSchema.parse(raw);
  if (!TOPIC_KEYS.has(input.topic)) throw errors.validation('Choose a topic from the list.', { field: 'topic' });
  noContact(input.title, 'title');
  noContact(input.body, 'body');
  const now = context.now ?? new Date();
  const today = await db().communityQuestion.count({ where: { authorUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } });
  if (today >= QUESTIONS_PER_DAY) throw errors.rateLimited(3600);
  const id = newId('question');
  await db().communityQuestion.create({ data: { id, authorUserId: me.userId, topic: input.topic, title: input.title, body: input.body } });
  await recordAuditEvent({ action: 'COMMUNITY_QUESTION_ASKED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId });
  return { questionId: id };
}

export const answerSchema = z.object({ body: z.string().trim().min(10, 'Write at least 10 characters.').max(5000) });

export async function answerQuestion(principal: Principal, questionId: string, raw: z.input<typeof answerSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = await verifiedAuthor(principal);
  const input = answerSchema.parse(raw);
  noContact(input.body, 'body');
  const now = context.now ?? new Date();
  const question = await db().communityQuestion.findFirst({ where: { id: questionId, status: 'PUBLISHED' }, select: { id: true, title: true, authorUserId: true } });
  if (!question) throw errors.notFound('Question');
  const today = await db().communityAnswer.count({ where: { authorUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } });
  if (today >= ANSWERS_PER_DAY) throw errors.rateLimited(3600);
  const id = newId('answer');
  await db().communityAnswer.create({ data: { id, questionId, authorUserId: me.userId, body: input.body } });
  await recordAuditEvent({ action: 'COMMUNITY_ANSWER_POSTED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { questionId } });
  if (question.authorUserId !== me.userId) {
    await notifyUser({ userId: question.authorUserId, notificationId: 'TL-NOTIF-COMMUNITY-ANSWER-001', data: { summary: `Your question “${question.title.slice(0, 80)}” has a new answer.` }, linkUrl: `/community/${questionId}` });
  }
  return { answerId: id };
}

export async function acceptAnswer(principal: Principal, questionId: string, answerId: string | null, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const question = await db().communityQuestion.findUnique({ where: { id: questionId }, select: { authorUserId: true, status: true } });
  if (!question || question.status !== 'PUBLISHED') throw errors.notFound('Question');
  if (question.authorUserId !== principal.userId) throw errors.forbidden();
  if (answerId) {
    const answer = await db().communityAnswer.findFirst({ where: { id: answerId, questionId, status: 'PUBLISHED' }, select: { id: true } });
    if (!answer) throw errors.validation('Choose a published answer to this question.', { field: 'answerId' });
  }
  await db().communityQuestion.update({ where: { id: questionId }, data: { acceptedAnswerId: answerId } });
  await recordAuditEvent({ action: answerId ? 'COMMUNITY_ANSWER_ACCEPTED' : 'COMMUNITY_ANSWER_UNACCEPTED', actor: principal.userId, subject: questionId, outcome: 'success', requestId: context.requestId, detail: { answerId } });
}

export const targetSchema = z.object({ targetType: z.enum(['QUESTION', 'ANSWER']), targetId: z.string().max(64) });

/** The author removes their own post: its text is cleared, not merely hidden. */
export async function removeOwnPost(principal: Principal, raw: z.input<typeof targetSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const { targetType, targetId } = targetSchema.parse(raw);
  const done =
    targetType === 'QUESTION'
      ? await db().communityQuestion.updateMany({ where: { id: targetId, authorUserId: principal.userId, status: { not: 'REMOVED' } }, data: { status: 'REMOVED', title: 'Removed by its author', body: '' } })
      : await db().communityAnswer.updateMany({ where: { id: targetId, authorUserId: principal.userId, status: { not: 'REMOVED' } }, data: { status: 'REMOVED', body: '' } });
  if (done.count === 0) throw errors.notFound(targetType === 'QUESTION' ? 'Question' : 'Answer');
  if (targetType === 'ANSWER') await db().communityQuestion.updateMany({ where: { acceptedAnswerId: targetId }, data: { acceptedAnswerId: null } });
  await recordAuditEvent({ action: `COMMUNITY_${targetType}_REMOVED`, actor: principal.userId, subject: targetId, outcome: 'success', requestId: context.requestId });
}

// ---------------------------------------------------------------------------
// Reports and moderation
// ---------------------------------------------------------------------------

export const reportSchema = targetSchema.extend({
  reason: z.enum(['SPAM', 'ABUSE', 'MISINFORMATION', 'PRIVACY', 'OTHER']),
  note: z.string().trim().max(500).optional(),
});

async function loadTarget(targetType: CommunityTarget, targetId: string) {
  const row =
    targetType === 'QUESTION'
      ? await db().communityQuestion.findUnique({ where: { id: targetId }, select: { authorUserId: true, status: true, title: true } })
      : await db().communityAnswer.findUnique({ where: { id: targetId }, select: { authorUserId: true, status: true, question: { select: { title: true } } } });
  if (!row) throw errors.notFound(targetType === 'QUESTION' ? 'Question' : 'Answer');
  return { authorUserId: row.authorUserId, status: row.status, title: 'title' in row ? row.title : row.question.title };
}

async function setVisibility(tx: Prisma.TransactionClient, targetType: CommunityTarget, targetId: string, status: 'PUBLISHED' | 'HIDDEN', reason: string | null) {
  const where = { id: targetId, status: { not: 'REMOVED' as const } };
  const data = { status, hiddenReason: reason };
  return targetType === 'QUESTION' ? tx.communityQuestion.updateMany({ where, data }) : tx.communityAnswer.updateMany({ where, data });
}

export async function reportPost(principal: Principal, raw: z.input<typeof reportSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = reportSchema.parse(raw);
  if (input.reason === 'OTHER' && !input.note) throw errors.validation('Say what is wrong.', { field: 'note' });
  const target = await loadTarget(input.targetType, input.targetId);
  if (target.status === 'REMOVED') throw errors.preconditionFailed('This post was removed.');
  if (target.authorUserId === principal.userId) throw errors.preconditionFailed('You cannot report your own post. Remove it instead.');
  const id = newId('report');
  const key = input.targetType === 'QUESTION' ? { questionId: input.targetId } : { answerId: input.targetId };
  let hidden = false;
  try {
    hidden = await transaction(async (tx) => {
      await tx.communityReport.create({ data: { id, targetType: input.targetType, ...key, reporterUserId: principal.userId, reason: input.reason, note: input.note ?? null } });
      const open = await tx.communityReport.count({ where: { ...key, status: 'OPEN' } });
      if (open >= AUTO_HIDE_REPORTS && target.status === 'PUBLISHED') {
        return (await setVisibility(tx, input.targetType, input.targetId, 'HIDDEN', 'Hidden after several reports, pending review.')).count > 0;
      }
      return false;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already reported this post.');
    throw error;
  }
  await recordAuditEvent({ action: 'COMMUNITY_POST_REPORTED', actor: principal.userId, subject: input.targetId, outcome: 'success', requestId: context.requestId, detail: { reason: input.reason, autoHidden: hidden } });
  if (hidden) {
    await notifyUser({ userId: target.authorUserId, notificationId: 'TL-NOTIF-COMMUNITY-MODERATION-001', data: { summary: `Your post in “${target.title.slice(0, 80)}” is hidden after several reports while a moderator reviews it.` }, linkUrl: '/community' });
  }
  return { reportId: id, hidden };
}

export const moderationSchema = targetSchema.extend({ action: z.enum(['HIDE', 'RESTORE']), reason: z.string().trim().max(500).optional() });

export async function moderatePost(principal: Principal, raw: z.input<typeof moderationSchema>, context: { requestId?: string } = {}) {
  if (!isAuthenticated(principal) || !can(principal, MODERATE)) throw errors.forbidden(MODERATE);
  const input = moderationSchema.parse(raw);
  if (input.action === 'HIDE' && !input.reason) throw errors.validation('Give the reason the author will see.', { field: 'reason' });
  const target = await loadTarget(input.targetType, input.targetId);
  if (target.status === 'REMOVED') throw errors.preconditionFailed('This post was removed by its author.');
  const key = input.targetType === 'QUESTION' ? { questionId: input.targetId } : { answerId: input.targetId };
  const now = new Date();
  await transaction(async (tx) => {
    await setVisibility(tx, input.targetType, input.targetId, input.action === 'HIDE' ? 'HIDDEN' : 'PUBLISHED', input.action === 'HIDE' ? input.reason! : null);
    await tx.communityReport.updateMany({ where: { ...key, status: 'OPEN' }, data: { status: input.action === 'HIDE' ? 'UPHELD' : 'DISMISSED', decidedByUserId: principal.userId, decidedAt: now } });
    if (input.action === 'HIDE' && input.targetType === 'ANSWER') await tx.communityQuestion.updateMany({ where: { acceptedAnswerId: input.targetId }, data: { acceptedAnswerId: null } });
  });
  await recordAuditEvent({ action: `COMMUNITY_POST_${input.action}`, actor: principal.userId, subject: input.targetId, outcome: 'success', requestId: context.requestId, detail: { reason: input.reason ?? null } });
  if (input.action === 'HIDE') {
    await notifyUser({ userId: target.authorUserId, notificationId: 'TL-NOTIF-COMMUNITY-MODERATION-001', data: { summary: `A moderator hid your post in “${target.title.slice(0, 80)}”: ${input.reason}` }, linkUrl: '/community' });
  }
}

export async function moderationQueue(principal: Principal) {
  if (!isAuthenticated(principal) || !can(principal, MODERATE)) throw errors.forbidden(MODERATE);
  const [reports, hiddenQuestions, hiddenAnswers] = await Promise.all([
    db().communityReport.findMany({
      where: { status: 'OPEN' },
      include: { question: { select: { id: true, title: true, body: true, status: true } }, answer: { select: { id: true, body: true, status: true, question: { select: { id: true, title: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 300,
    }),
    db().communityQuestion.findMany({ where: { status: 'HIDDEN' }, select: { id: true, title: true, hiddenReason: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    db().communityAnswer.findMany({ where: { status: 'HIDDEN' }, select: { id: true, body: true, hiddenReason: true, updatedAt: true, question: { select: { id: true, title: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 }),
  ]);
  return { reports, hiddenQuestions, hiddenAnswers };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const AUTHOR = { select: { displayName: true, dentistProfile: { select: { slug: true, isVerified: true, isDiscoverable: true, verificationExpiresAt: true } } } } as const;
type AuthorRow = { displayName: string | null; dentistProfile: { slug: string; isVerified: boolean; isDiscoverable: boolean; verificationExpiresAt: Date | null } | null };

/** Name and, for a currently verified dentist, the badge and profile link. */
export function presentAuthor(author: AuthorRow, now: Date = new Date()) {
  const d = author.dentistProfile;
  const verified = Boolean(d && d.isVerified && (!d.verificationExpiresAt || d.verificationExpiresAt > now));
  return { name: author.displayName ?? 'Member', verifiedDentist: verified, dentistSlug: verified && d!.isDiscoverable ? d!.slug : null };
}

export async function listQuestions(filter: { topic?: string; unanswered?: boolean; q?: string } = {}) {
  const q = filter.q?.trim();
  const rows = await db().communityQuestion.findMany({
    where: {
      status: 'PUBLISHED',
      ...(filter.topic && TOPIC_KEYS.has(filter.topic) ? { topic: filter.topic } : {}),
      ...(filter.unanswered ? { answers: { none: { status: 'PUBLISHED' } } } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { body: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    include: { author: AUTHOR, _count: { select: { answers: { where: { status: 'PUBLISHED' } } } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({ id: r.id, topic: r.topic, title: r.title, createdAt: r.createdAt, answers: r._count.answers, accepted: r.acceptedAnswerId !== null, author: presentAuthor(r.author) }));
}

/**
 * A question with its published answers: the accepted one first, then
 * verified dentists', then the rest, oldest first. A hidden question is
 * shown only to its author and moderators, with the reason.
 */
export async function getQuestion(questionId: string, principal: Principal) {
  const question = await db().communityQuestion.findUnique({
    where: { id: questionId },
    include: { author: AUTHOR, answers: { where: { status: { in: ['PUBLISHED', 'HIDDEN'] } }, include: { author: AUTHOR }, orderBy: { createdAt: 'asc' } } },
  });
  if (!question || question.status === 'REMOVED') return null;
  const viewer = isAuthenticated(principal) ? principal.userId : null;
  const moderator = isAuthenticated(principal) && can(principal, MODERATE);
  if (question.status === 'HIDDEN' && !moderator && question.authorUserId !== viewer) return null;
  const now = new Date();
  const answers = question.answers
    .filter((a) => a.status === 'PUBLISHED' || moderator || a.authorUserId === viewer)
    .map((a) => ({ id: a.id, body: a.body, status: a.status, hiddenReason: a.hiddenReason, createdAt: a.createdAt, mine: a.authorUserId === viewer, accepted: a.id === question.acceptedAnswerId, author: presentAuthor(a.author, now) }))
    .sort((a, b) => Number(b.accepted) - Number(a.accepted) || Number(b.author.verifiedDentist) - Number(a.author.verifiedDentist) || a.createdAt.getTime() - b.createdAt.getTime());
  return {
    id: question.id,
    topic: question.topic,
    title: question.title,
    body: question.body,
    status: question.status,
    hiddenReason: question.hiddenReason,
    createdAt: question.createdAt,
    mine: question.authorUserId === viewer,
    author: presentAuthor(question.author, now),
    answers,
    viewer: { signedIn: viewer !== null, moderator },
  };
}
