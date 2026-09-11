/**
 * TOOTHLOGY AI — bound by the AI covenant (Constitution §5)
 *
 * 1. AI never diagnoses. The only purpose allowed is summarising a published,
 *    clinically reviewed knowledge article; the instruction is fixed here and
 *    forbids adding advice, diagnosis or anything not in the text.
 * 2. AI output is labelled: every result carries the label the reader sees.
 * 3. AI touches no patient data. It is given only public, reviewed content,
 *    fetched through the same public read any visitor gets — no privileged
 *    path to records exists here.
 * 4. AI does not rank anything today, so nothing influences discovery order.
 * 5. Nothing is sent that could be trained on from a patient: no patient data
 *    at all.
 *
 * Every call is audited — purpose, model, token counts — without the text.
 * With no model connected the port rejects with NOT_CONFIGURED and pages do
 * not offer the feature.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { recordAuditEvent } from '../audit';
import { isAuthenticated, type Principal } from '../rbac';
import { getArticle } from '../knowledge/service';
import { LANGUAGES } from '../../registry/globalization';
import { aiProvider, type AiPurpose } from './ports';

export const AI_LABEL = 'Summary written by AI from the reviewed article. It can be wrong — the article is the source, and neither is a diagnosis.';

export const AI_TRANSLATION_LABEL = 'Translated by AI from the reviewed article. It can be wrong — the reviewed article is the source, and neither is a diagnosis.';

const INSTRUCTIONS: Readonly<Record<AiPurpose, string>> = {
  ARTICLE_SUMMARY:
    'Summarise the following published dental article for a patient in plain language, in at most five short sentences. Use only what the article says. Do not add advice, a diagnosis, treatment recommendations or anything not in the text. Do not address the reader’s own condition.',
  ARTICLE_TRANSLATION:
    'Translate the following published dental article faithfully into the requested language. Keep its meaning, headings and order. Do not summarise, add, omit, soften or strengthen anything, and do not add advice or a diagnosis. Keep medicine names, doses and numbers exactly as written.',
};

const MAX_INPUT_CHARS = 30_000;

export function aiStatus(): { configured: boolean } {
  return { configured: aiProvider.isConfigured() };
}

export const summarySchema = z.object({
  slug: z.string().trim().min(1).max(120),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Choose a language.').optional(),
});

/** A labelled plain-language summary of a published article. */
export async function summariseArticle(principal: Principal, raw: z.input<typeof summarySchema>, context: { requestId?: string } = {}) {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]!.message, { field: String(parsed.error.issues[0]!.path[0] ?? 'slug') });
  const input = parsed.data;
  const article = await getArticle(input.slug);
  if (!article) throw errors.notFound('Article');
  const actor = isAuthenticated(principal) ? principal.userId : 'anonymous';
  const text = [article.title, article.summary, article.body].join('\n\n').slice(0, MAX_INPUT_CHARS);
  try {
    const result = await aiProvider.get().complete({ purpose: 'ARTICLE_SUMMARY', instruction: INSTRUCTIONS.ARTICLE_SUMMARY, input: text, maxOutputTokens: 300, locale: input.locale ?? 'en-IN' });
    await recordAuditEvent({ action: 'AI_COMPLETION', actor, subject: `article:${article.slug}`, outcome: 'success', requestId: context.requestId, // "Units", not "tokens": the audit redactor blanks any key that looks like a credential.
      detail: { purpose: 'ARTICLE_SUMMARY', model: result.model, modelUnitsIn: result.inputTokens ?? null, modelUnitsOut: result.outputTokens ?? null } });
    return { summary: result.text.trim(), label: AI_LABEL, model: result.model, purpose: 'ARTICLE_SUMMARY' as const };
  } catch (error) {
    await recordAuditEvent({ action: 'AI_COMPLETION', actor, subject: `article:${article.slug}`, outcome: 'failure', requestId: context.requestId, detail: { purpose: 'ARTICLE_SUMMARY', configured: aiProvider.isConfigured() } });
    throw error;
  }
}

/** Languages an article may be translated into: those switched on, other than the one articles are reviewed in. */
export function translationLanguages(): Array<{ code: string; name: string; nativeName: string }> {
  return LANGUAGES.filter((l) => l.enabled && l.code !== 'en').map((l) => ({ code: l.code, name: l.name, nativeName: l.nativeName }));
}

export const translationSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  language: z.string().regex(/^[a-z]{2}$/, 'Choose a language.'),
});

/**
 * A labelled translation of a published, reviewed article into a language
 * switched on in Toothlogy. Public reviewed text only; audited without it.
 */
export async function translateArticle(principal: Principal, raw: z.input<typeof translationSchema>, context: { requestId?: string } = {}) {
  const parsed = translationSchema.safeParse(raw);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]!.message, { field: String(parsed.error.issues[0]!.path[0] ?? 'language') });
  const input = parsed.data;
  if (!translationLanguages().some((l) => l.code === input.language)) throw errors.validation('Articles can be translated into the languages Toothlogy offers.', { field: 'language' });
  const article = await getArticle(input.slug);
  if (!article) throw errors.notFound('Article');
  const actor = isAuthenticated(principal) ? principal.userId : 'anonymous';
  const text = [article.title, article.summary, article.body].join('\n\n').slice(0, MAX_INPUT_CHARS);
  try {
    const result = await aiProvider.get().complete({ purpose: 'ARTICLE_TRANSLATION', instruction: INSTRUCTIONS.ARTICLE_TRANSLATION, input: text, maxOutputTokens: 4000, locale: input.language });
    await recordAuditEvent({ action: 'AI_COMPLETION', actor, subject: `article:${article.slug}`, outcome: 'success', requestId: context.requestId, detail: { purpose: 'ARTICLE_TRANSLATION', language: input.language, model: result.model, modelUnitsIn: result.inputTokens ?? null, modelUnitsOut: result.outputTokens ?? null } });
    return { translation: result.text.trim(), language: input.language, label: AI_TRANSLATION_LABEL, model: result.model, purpose: 'ARTICLE_TRANSLATION' as const };
  } catch (error) {
    await recordAuditEvent({ action: 'AI_COMPLETION', actor, subject: `article:${article.slug}`, outcome: 'failure', requestId: context.requestId, detail: { purpose: 'ARTICLE_TRANSLATION', language: input.language, configured: aiProvider.isConfigured() } });
    throw error;
  }
}
