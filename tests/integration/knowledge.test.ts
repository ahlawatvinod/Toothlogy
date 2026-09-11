/**
 * TL-TEST-KNOWLEDGE-001 — the dental knowledge library.
 *
 * Only verified dentists write; links and contact details stay out of the
 * text; clinical kinds cite sources; nobody reviews their own; changes
 * requested need a note; publishing copies the working copy live; a revision
 * leaves the reviewed version up until approved; kind is fixed once
 * published; search; archive takes it off; notifications carry the outcome.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { archiveArticle, articleForEditing, createArticle, getArticle, listArticles, reviewArticle, reviewQueue, submitArticle, updateArticle } from '@/platform/knowledge/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const BODY = [
  '## What it is',
  'Tooth sensitivity is a short, sharp pain when teeth meet cold, heat, sweet or acidic food, or brushing. It usually comes from exposed dentine.',
  '## What helps',
  '- A desensitising toothpaste used twice daily',
  '- A soft brush and gentle technique',
  'See a dentist if it lasts more than a few weeks or wakes you at night.',
].join('\n\n');
const CITE = { title: 'Dentine hypersensitivity: guidelines for management', source: 'British Dental Journal', year: 2021, url: 'https://example.org/dh' };

function principal(userId: string, roles: string[]): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations: [], sessionId: 'test-session' };
}

let seq = 0;
async function person(label: string, role: 'dentist' | 'patient', verified = false) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role, acceptedTerms: true });
  if (verified) await testDb().dentistProfile.create({ data: { id: `prf_k${seq}_${Math.random().toString(36).slice(2, 8)}`, userId, slug: `k-${label}-${seq}`, languages: ['en'], status: 'VERIFIED', isVerified: true, verifiedAt: new Date() } });
  return userId;
}

const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('Dental knowledge', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('lets only verified dentists write, and keeps links and contact details out of the text', async () => {
    const patient = principal(await person('pat', 'patient'), ['patient']);
    const unverified = principal(await person('newdr', 'dentist'), ['dentist']);
    const author = principal(await person('drk', 'dentist', true), ['dentist']);
    const draft = { kind: 'CONDITION' as const, title: 'Tooth sensitivity', summary: 'Why teeth hurt with cold drinks, and what helps.', body: BODY, citations: [] };

    expect(await code(createArticle(patient, draft))).toBe('FORBIDDEN');
    expect(await code(createArticle(unverified, draft))).toBe('PRECONDITION_FAILED');
    expect(await code(createArticle(author, { ...draft, body: `${BODY}\n\nMore at https://spam.example` }))).toBe('VALIDATION_FAILED');
    expect(await code(createArticle(author, { ...draft, summary: 'Call me on 9827012345 for a free consultation now.' }))).toBe('VALIDATION_FAILED');
    expect(await code(createArticle(author, { ...draft, body: 'Too short.' }))).toBe('VALIDATION_FAILED');
    expect(await code(createArticle(author, { ...draft, treatmentKey: 'no_such_treatment' }))).toBe('VALIDATION_FAILED');

    const { articleId, slug } = await createArticle(author, draft);
    expect(slug).toBe('tooth-sensitivity');
    expect((await createArticle(author, draft)).slug).toMatch(/^tooth-sensitivity-[a-z0-9]{4}$/);
    // A draft is invisible to readers.
    expect(await getArticle(slug)).toBeNull();
    expect((await listArticles({})).total).toBe(0);
    // A clinical article needs a source before review.
    expect(await code(submitArticle(author, articleId))).toBe('VALIDATION_FAILED');
    // Nobody else edits it.
    expect(await code(updateArticle(unverified, articleId, { title: 'Hijacked title' }))).toBe('NOT_FOUND');
  });

  it('reviews by someone else, publishes the reviewed copy, and keeps it live through a revision', async () => {
    const author = principal(await person('drauthor', 'dentist', true), ['dentist', 'medical_reviewer']);
    const reviewer = principal(await person('drreviewer', 'dentist', true), ['dentist', 'medical_reviewer']);
    const treatment = await testDb().treatment.findFirstOrThrow({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const { articleId, slug } = await createArticle(author, { kind: 'TREATMENT', title: `About ${treatment.name}`, summary: 'What happens, how long it takes, and aftercare.', body: BODY, citations: [CITE], treatmentKey: treatment.key });
    await submitArticle(author, articleId);
    expect(await code(submitArticle(author, articleId))).toBe('CONFLICT');
    expect((await reviewQueue(reviewer)).map((a) => a.id)).toEqual([articleId]);

    expect(await code(reviewArticle(author, articleId, { decision: 'PUBLISH' }))).toBe('PRECONDITION_FAILED');
    expect(await code(reviewArticle(reviewer, articleId, { decision: 'REQUEST_CHANGES', note: 'short' }))).toBe('VALIDATION_FAILED');
    await reviewArticle(reviewer, articleId, { decision: 'REQUEST_CHANGES', note: 'Add how long numbness lasts after the anaesthetic.' });
    const asked = await testDb().inAppNotification.findFirstOrThrow({ where: { userId: author.userId, notificationId: 'TL-NOTIF-ARTICLE-REVIEWED-001' } });
    expect(asked.body).toContain(`About ${treatment.name}`);
    expect(asked.body).toContain('needs changes');
    expect((await articleForEditing(author, articleId)).article).toMatchObject({ status: 'CHANGES_REQUESTED', reviewNote: 'Add how long numbness lasts after the anaesthetic.' });

    await updateArticle(author, articleId, { body: `${BODY}\n\nNumbness usually wears off within two to four hours.` });
    expect((await articleForEditing(author, articleId)).article.status).toBe('CHANGES_REQUESTED');
    await submitArticle(author, articleId);
    await reviewArticle(reviewer, articleId, { decision: 'PUBLISH' });

    const live = await getArticle(slug);
    expect(live).toMatchObject({ kind: 'TREATMENT', reviewer: expect.stringContaining('drreviewer'), treatment: { key: treatment.key } });
    expect(live!.body).toContain('two to four hours');
    expect(live!.citations).toEqual([CITE]);
    const found = await listArticles({ q: treatment.name.slice(0, 5) });
    expect(found.items.map((i) => i.slug)).toContain(slug);
    expect((await listArticles({ kind: 'BLOG' })).total).toBe(0);

    // A revision stays private until approved; kind is fixed once published.
    await updateArticle(author, articleId, { body: `${BODY}\n\nA revised paragraph nobody has reviewed yet.` });
    expect((await articleForEditing(author, articleId)).article.status).toBe('DRAFT');
    expect((await getArticle(slug))!.body).not.toContain('nobody has reviewed');
    expect(await code(updateArticle(author, articleId, { kind: 'BLOG' }))).toBe('VALIDATION_FAILED');
    await submitArticle(author, articleId);
    await reviewArticle(reviewer, articleId, { decision: 'PUBLISH' });
    expect((await getArticle(slug))!.body).toContain('nobody has reviewed');
    const row = await testDb().article.findUniqueOrThrow({ where: { id: articleId } });
    expect(row.reviewedByUserId).toBe(reviewer.userId);
    expect(row.publishedAt!.getTime()).toBeLessThanOrEqual(row.lastReviewedAt!.getTime());
  });

  it('publishes a blog post without sources, and archives on a reviewer’s word', async () => {
    const author = principal(await person('drblog', 'dentist', true), ['dentist']);
    const reviewer = principal(await person('drrev2', 'dentist', true), ['medical_reviewer']);
    const { articleId, slug } = await createArticle(author, { kind: 'BLOG', title: 'A week at a village dental camp', summary: 'What we saw, and what patients taught us.', body: BODY, citations: [] });
    await submitArticle(author, articleId);
    await reviewArticle(reviewer, articleId, { decision: 'PUBLISH', note: 'Lovely.' });
    expect(await getArticle(slug)).not.toBeNull();

    const outsider = principal(await person('other', 'dentist', true), ['dentist']);
    expect(await code(archiveArticle(outsider, articleId, { reason: 'I dislike it.' }))).toBe('NOT_FOUND');
    await archiveArticle(reviewer, articleId, { reason: 'Names a patient without consent.' });
    expect(await getArticle(slug)).toBeNull();
    expect((await listArticles({})).total).toBe(0);
    expect(await code(archiveArticle(author, articleId, { reason: 'Again, twice.' }))).toBe('CONFLICT');
    expect(await code(updateArticle(author, articleId, { title: 'Try to revive it' }))).toBe('PRECONDITION_FAILED');
    const told = await testDb().inAppNotification.findMany({ where: { userId: author.userId, notificationId: 'TL-NOTIF-ARTICLE-REVIEWED-001' }, orderBy: { createdAt: 'asc' } });
    expect(told.map((n) => n.body).join(' ')).toContain('Names a patient without consent.');
  });
});
