/**
 * TL-TEST-COMMUNITY-001 — questions, answers, reports and moderation.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import {
  acceptAnswer,
  answerQuestion,
  askQuestion,
  getQuestion,
  listQuestions,
  moderatePost,
  moderationQueue,
  removeOwnPost,
  reportPost,
} from '@/platform/community/service';
import type { AuthenticatedPrincipal, Principal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const anonymous = { kind: 'anonymous' } as unknown as Principal;

function principal(userId: string, roles: string[] = ['patient']): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations: [], sessionId: 'test-session' };
}

let seq = 0;
async function member(label: string, verified = true) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  if (verified) await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return principal(userId);
}

async function verifiedDentist(label: string) {
  const p = await member(label);
  await testDb().dentistProfile.create({ data: { id: `dpr_${Math.random().toString(36).slice(2)}`, userId: p.userId, slug: `dr-${label}-${seq}`, languages: ['en'], isVerified: true, verifiedAt: new Date(), isDiscoverable: true } });
  return p;
}

const ASK = { topic: 'gums', title: 'Is it normal for gums to bleed after flossing?', body: 'I started flossing last week and my gums bleed a little every time. Should I stop?' };

describeIntegration('Community', () => {
  let moderator: AuthenticatedPrincipal;

  beforeAll(async () => {
    await assertSeeded();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    const m = await member('moderator');
    await testDb().roleAssignment.create({ data: { id: `ra_${Math.random().toString(36).slice(2)}`, userId: m.userId, roleKey: 'moderator' } });
    moderator = principal(m.userId, ['moderator']);
  });

  it('takes questions from verified members only, refuses contact details, and limits the day', async () => {
    const asker = await member('asker');
    await expect(askQuestion(await member('fresh', false), ASK)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(askQuestion(anonymous, ASK)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(askQuestion(asker, { ...ASK, topic: 'politics' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(askQuestion(asker, { ...ASK, body: 'Please call me on 98270 12345 to discuss my gums bleeding.' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(askQuestion(asker, { ...ASK, body: 'Write to me at asker@example.com about my bleeding gums please.' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    for (let i = 0; i < 5; i += 1) await askQuestion(asker, { ...ASK, title: `${ASK.title} (${i + 1})` });
    await expect(askQuestion(asker, ASK)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(await listQuestions({ topic: 'gums' })).toHaveLength(5);
    expect(await listQuestions({ topic: 'braces' })).toHaveLength(0);
    expect(await listQuestions({ q: '(3)' })).toHaveLength(1);
  });

  it('orders answers accepted first, then verified dentists, tells the asker, and lets only the asker accept', async () => {
    const asker = await member('asker');
    const helper = await member('helper');
    const dentist = await verifiedDentist('ortho');
    const { questionId } = await askQuestion(asker, ASK);
    const first = await answerQuestion(helper, questionId, { body: 'Mine bled for a week and then stopped. Keep going gently.' });
    const second = await answerQuestion(dentist, questionId, { body: 'Mild bleeding in the first week or two is common while gums adapt. If it persists beyond two weeks, see a dentist.' });
    await answerQuestion(asker, questionId, { body: 'Thank you both, that is reassuring.' });
    expect(await testDb().inAppNotification.count({ where: { userId: asker.userId, notificationId: 'TL-NOTIF-COMMUNITY-ANSWER-001' } })).toBe(2);
    await expect(answerQuestion(helper, questionId, { body: 'Or email me: helper@example.com for tips' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    let view = await getQuestion(questionId, anonymous);
    expect(view?.answers.map((a) => a.id)[0]).toBe(second.answerId);
    expect(view?.answers[0]!.author).toMatchObject({ verifiedDentist: true });

    await expect(acceptAnswer(helper, questionId, first.answerId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const elsewhere = await askQuestion(helper, { ...ASK, title: 'Which toothbrush is best for sensitive gums?' });
    const foreign = await answerQuestion(asker, elsewhere.questionId, { body: 'A soft-bristled brush, replaced every three months.' });
    await expect(acceptAnswer(asker, questionId, foreign.answerId)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await acceptAnswer(asker, questionId, first.answerId);
    view = await getQuestion(questionId, anonymous);
    expect(view?.answers.map((a) => a.id).slice(0, 2)).toEqual([first.answerId, second.answerId]);
    expect((await listQuestions({})).find((q) => q.id === questionId)?.accepted).toBe(true);

    // The author removes their answer: text cleared, acceptance undone.
    await expect(removeOwnPost(asker, { targetType: 'ANSWER', targetId: first.answerId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await removeOwnPost(helper, { targetType: 'ANSWER', targetId: first.answerId });
    expect(await testDb().communityAnswer.findUniqueOrThrow({ where: { id: first.answerId } })).toMatchObject({ status: 'REMOVED', body: '' });
    expect((await testDb().communityQuestion.findUniqueOrThrow({ where: { id: questionId } })).acceptedAnswerId).toBeNull();
    expect((await getQuestion(questionId, anonymous))?.answers.map((a) => a.id)).not.toContain(first.answerId);
    expect(await listQuestions({ unanswered: true })).toHaveLength(0);
  });

  it('hides a post after three reports, lets moderators hide with a reason or restore, and tells the author', async () => {
    const asker = await member('asker');
    const spammer = await member('spammer');
    const { questionId } = await askQuestion(asker, ASK);
    const spam = await answerQuestion(spammer, questionId, { body: 'Buy our miracle gum oil, cures everything in one day, guaranteed!' });
    await expect(reportPost(spammer, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'SPAM' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(reportPost(asker, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'OTHER' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const reporters = [asker, await member('r2'), await member('r3')];
    expect((await reportPost(reporters[0]!, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'SPAM' })).hidden).toBe(false);
    await expect(reportPost(reporters[0]!, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'SPAM' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await reportPost(reporters[1]!, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'MISINFORMATION' });
    expect((await reportPost(reporters[2]!, { targetType: 'ANSWER', targetId: spam.answerId, reason: 'SPAM' })).hidden).toBe(true);
    expect(await testDb().inAppNotification.count({ where: { userId: spammer.userId, notificationId: 'TL-NOTIF-COMMUNITY-MODERATION-001' } })).toBe(1);
    expect((await getQuestion(questionId, anonymous))?.answers).toHaveLength(0);
    expect((await getQuestion(questionId, moderator))?.answers.map((a) => a.status)).toEqual(['HIDDEN']);
    expect((await getQuestion(questionId, spammer))?.answers.map((a) => a.mine)).toEqual([true]);
    expect((await moderationQueue(moderator)).reports).toHaveLength(3);

    // Moderators only; a reason is required to hide.
    await expect(moderatePost(asker, { targetType: 'QUESTION', targetId: questionId, action: 'HIDE', reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(moderationQueue(asker)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await moderatePost(moderator, { targetType: 'ANSWER', targetId: spam.answerId, action: 'HIDE', reason: 'Advertising a product with false health claims.' });
    expect(await testDb().communityReport.count({ where: { answerId: spam.answerId, status: 'UPHELD' } })).toBe(3);
    await expect(moderatePost(moderator, { targetType: 'QUESTION', targetId: questionId, action: 'HIDE' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await moderatePost(moderator, { targetType: 'QUESTION', targetId: questionId, action: 'HIDE', reason: 'Duplicate of an existing question.' });
    expect(await listQuestions({})).toHaveLength(0);
    expect(await getQuestion(questionId, anonymous)).toBeNull();
    expect((await getQuestion(questionId, asker))?.hiddenReason).toBe('Duplicate of an existing question.');
    await moderatePost(moderator, { targetType: 'QUESTION', targetId: questionId, action: 'RESTORE' });
    expect(await listQuestions({})).toHaveLength(1);

    // A report must name exactly one post.
    await expect(testDb().$executeRawUnsafe(`INSERT INTO "community_reports" ("id","targetType","questionId","answerId","reporterUserId","reason") VALUES ('rpt_bad','QUESTION','${questionId}','${spam.answerId}','${asker.userId}','SPAM')`)).rejects.toThrow();
  });
});
