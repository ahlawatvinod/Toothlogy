/**
 * TL-TEST-AI-001 — the AI port and the covenant around it.
 *
 * With no model connected, summarising refuses with NOT_CONFIGURED and says
 * so in the audit trail. With a stand-in adapter: only a published, reviewed
 * article is ever sent, under the fixed no-diagnosis instruction; the result
 * carries its label; the audit row records purpose, model and token counts but
 * not the text. Drafts and unknown articles are not found.
 */

import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createArticle, relatedArticles, reviewArticle, submitArticle } from '@/platform/knowledge/service';
import { AI_LABEL, AI_TRANSLATION_LABEL, aiStatus, summariseArticle, translateArticle, translationLanguages } from '@/platform/ai/service';
import { aiProvider, type AiRequest } from '@/platform/ai/ports';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const BODY = 'Tooth sensitivity is a short, sharp pain when teeth meet cold, heat, sweet or acidic food. It usually comes from exposed dentine, where the enamel has worn or the gum has receded. A desensitising toothpaste used twice a day often helps within weeks.';

function principal(userId: string, roles: string[]): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations: [], sessionId: 'test-session' };
}
let seq = 0;
async function dentist(label: string) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'dentist', acceptedTerms: true });
  await testDb().dentistProfile.create({ data: { id: `prf_ai${seq}_${Math.random().toString(36).slice(2, 8)}`, userId, slug: `ai-${label}-${seq}`, languages: ['en'], status: 'VERIFIED', isVerified: true, verifiedAt: new Date() } });
  return userId;
}
const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code?: string }) => error.code ?? String(error));

describeIntegration('AI under the covenant', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
  });
  afterEach(() => aiProvider.set(null));
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('refuses honestly when no model is connected, and only ever sends reviewed public text when one is', async () => {
    const author = principal(await dentist('author'), ['dentist']);
    const reviewer = principal(await dentist('reviewer'), ['medical_reviewer']);
    const reader = principal((await register({ email: 'reader@example.test', password: PASSWORD, displayName: 'Reader', role: 'patient', acceptedTerms: true })).userId, ['patient']);
    const { articleId, slug } = await createArticle(author, { kind: 'CONDITION', title: 'Tooth sensitivity', summary: 'Why teeth hurt with cold drinks, and what helps.', body: BODY, citations: [{ title: 'Guidance', source: 'A journal' }] });

    expect(aiStatus()).toEqual({ configured: false });
    expect(await code(summariseArticle(reader, { slug }))).toBe('NOT_FOUND'); // a draft is not public
    await submitArticle(author, articleId);
    await reviewArticle(reviewer, articleId, { decision: 'PUBLISH' });
    expect(await code(summariseArticle(reader, { slug }))).toBe('NOT_CONFIGURED');
    const refused = await testDb().auditEvent.findFirstOrThrow({ where: { action: 'AI_COMPLETION', subject: `article:${slug}` } });
    expect(refused.outcome).toBe('FAILURE');

    const seen: AiRequest[] = [];
    aiProvider.set({
      complete: async (request) => {
        seen.push(request);
        return { text: '  Sensitivity is a short pain from exposed dentine; a desensitising toothpaste often helps.  ', model: 'stand-in-1', inputTokens: 120, outputTokens: 20 };
      },
    });
    expect(aiStatus()).toEqual({ configured: true });
    const result = await summariseArticle(reader, { slug });
    expect(result).toEqual({ summary: 'Sensitivity is a short pain from exposed dentine; a desensitising toothpaste often helps.', label: AI_LABEL, model: 'stand-in-1', purpose: 'ARTICLE_SUMMARY' });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.purpose).toBe('ARTICLE_SUMMARY');
    expect(seen[0]!.instruction).toMatch(/Do not add advice, a diagnosis/);
    expect(seen[0]!.input).toContain('exposed dentine');
    const audited = await testDb().auditEvent.findFirstOrThrow({ where: { action: 'AI_COMPLETION', outcome: 'SUCCESS' } });
    expect(audited.detail).toMatchObject({ purpose: 'ARTICLE_SUMMARY', model: 'stand-in-1', modelUnitsIn: 120, modelUnitsOut: 20 });
    expect(JSON.stringify(audited.detail)).not.toContain('dentine');
    expect(await code(summariseArticle(reader, { slug: 'no-such-article' }))).toBe('NOT_FOUND');
    expect(await code(summariseArticle(reader, { slug, locale: 'not a locale' }))).toBe('VALIDATION_FAILED');
  });

  it('translates a reviewed article only into languages Toothlogy offers, labelled; related articles follow a fixed rule', async () => {
    const author = principal(await dentist('author'), ['dentist']);
    const reviewer = principal(await dentist('reviewer'), ['medical_reviewer']);
    const reader = principal((await register({ email: 'reader2@example.test', password: PASSWORD, displayName: 'Reader', role: 'patient', acceptedTerms: true })).userId, ['patient']);
    const publish = async (title: string) => {
      const { articleId, slug } = await createArticle(author, { kind: 'CONDITION', title, summary: `${title}: what it is and what helps.`, body: BODY, citations: [{ title: 'Guidance', source: 'A journal' }] });
      await submitArticle(author, articleId);
      await reviewArticle(reviewer, articleId, { decision: 'PUBLISH' });
      return slug;
    };
    const slug = await publish('Tooth sensitivity');

    expect(await code(translateArticle(reader, { slug, language: 'hi' }))).toBe('NOT_CONFIGURED');
    expect((await testDb().auditEvent.findFirstOrThrow({ where: { action: 'AI_COMPLETION', subject: `article:${slug}` } })).detail).toMatchObject({ purpose: 'ARTICLE_TRANSLATION', language: 'hi', configured: false });

    const seen: AiRequest[] = [];
    aiProvider.set({
      complete: async (request) => {
        seen.push(request);
        return { text: ' दाँतों की संवेदनशीलता ठंडे पेय से होने वाला तेज़, छोटा दर्द है। ', model: 'stand-in-1' };
      },
    });
    expect(translationLanguages().map((l) => l.code)).toEqual(['hi']);
    expect(await code(translateArticle(reader, { slug, language: 'en' }))).toBe('VALIDATION_FAILED'); // the language it was reviewed in
    expect(await code(translateArticle(reader, { slug, language: 'ta' }))).toBe('VALIDATION_FAILED'); // not switched on
    const result = await translateArticle(reader, { slug, language: 'hi' });
    expect(result).toEqual({ translation: 'दाँतों की संवेदनशीलता ठंडे पेय से होने वाला तेज़, छोटा दर्द है।', language: 'hi', label: AI_TRANSLATION_LABEL, model: 'stand-in-1', purpose: 'ARTICLE_TRANSLATION' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ purpose: 'ARTICLE_TRANSLATION', locale: 'hi' });
    expect(seen[0]!.instruction).toMatch(/Do not summarise, add, omit/);
    expect(seen[0]!.input).toContain('exposed dentine');

    // Related: same kind here (no treatment or field in common); drafts never appear.
    const second = await publish('Sensitive teeth after whitening');
    await createArticle(author, { kind: 'CONDITION', title: 'A draft about gums', summary: 'A draft that nobody has reviewed yet.', body: BODY, citations: [{ title: 'Guidance', source: 'A journal' }] });
    const related = await relatedArticles(slug);
    expect(related).toEqual([{ slug: second, title: 'Sensitive teeth after whitening', summary: 'Sensitive teeth after whitening: what it is and what helps.', reason: 'Same kind of article' }]);
    expect(await relatedArticles('no-such-article')).toEqual([]);
  });
});
