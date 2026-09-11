/**
 * TOOTHLOGY KNOWLEDGE — sourced explanations for patients, and dentists' blogs
 *
 * - Written by dentists whose credentials Toothlogy has verified.
 * - Nothing reaches readers without a clinical review by someone else holding
 *   the reviewer permission; clinical kinds (conditions, treatments,
 *   procedures, guides) must cite at least one source.
 * - Readers only ever see a reviewed version. The working copy is edited
 *   freely; approval copies it to the live fields. Revising a published
 *   article leaves the reviewed version up until the revision is approved.
 *   Kind, treatment, specialty and cover are fixed once published.
 * - No links or contact details in the text (sources carry the links), and no
 *   HTML: the body is plain text with "## " headings and "- " lists, rendered
 *   by React.
 * - Archiving takes an article off the site; nothing is deleted.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { DENTAL_SPECIALTIES } from '../dentists/specialties';
import { containsContactDetails } from '@/lib/contact-details';
import { CLINICAL_KINDS, type Citation } from './labels';

export const WRITE = 'tl.knowledge.article.write';
export const REVIEW = 'tl.knowledge.article.review';
const DAY = 86_400_000;
const DRAFTS_PER_DAY = 10;
const PAGE_SIZE = 20;
const KINDS = ['CONDITION', 'TREATMENT', 'PROCEDURE', 'GUIDE', 'BLOG'] as const;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/** Validate as the routes do: a bad input is VALIDATION_FAILED naming the field. */
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw errors.validation(issue.message, issue.path.length ? { field: issue.path.map(String).join('.') } : undefined);
}

const citationSchema = z.object({
  title: z.string().trim().min(3, 'Give the source’s title.').max(300),
  source: z.string().trim().min(2, 'Say where it was published.').max(200),
  year: z.number().int().min(1800).max(2100).optional(),
  url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/, 'Use a full web address (https://…).').optional(),
});

// No defaults: the update schema is `.partial()` of this one.
export const articleSchema = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(5, 'Give it a title.').max(160),
  summary: z.string().trim().min(20, 'Summarise it in a sentence or two (20 characters or more).').max(300),
  body: z.string().trim().min(200, 'Write at least a few paragraphs (200 characters or more).').max(30_000),
  citations: z.array(citationSchema).max(30),
  treatmentKey: z.string().max(80).optional(),
  specialtyKey: z.string().max(80).optional(),
  coverFileId: z.string().max(64).optional(),
});
export const articleUpdateSchema = articleSchema.partial();

const LINK = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\./i;

function checkText(input: { title?: string; summary?: string; body?: string }) {
  for (const field of ['title', 'summary', 'body'] as const) {
    const text = input[field];
    if (!text) continue;
    if (LINK.test(text)) throw errors.validation('Put links in the sources, not in the text.', { field });
    if (containsContactDetails(text)) throw errors.validation('Leave out phone numbers and email addresses.', { field });
  }
}

function checkSpecialty(key: string | undefined) {
  if (key && !DENTAL_SPECIALTIES.some((s) => s.key === key)) throw errors.validation('Choose a specialty from the list.', { field: 'specialtyKey' });
}

async function resolveTreatment(key: string | undefined): Promise<string | null> {
  if (!key) return null;
  const t = await db().treatment.findFirst({ where: { key, isActive: true }, select: { id: true } });
  if (!t) throw errors.validation('Choose a treatment from the catalogue.', { field: 'treatmentKey' });
  return t.id;
}

async function resolveCover(userId: string, fileId: string | undefined): Promise<string | null> {
  if (!fileId) return null;
  const f = await db().fileObject.findFirst({ where: { id: fileId, ownerUserId: userId, purpose: 'CONTENT_MEDIA', status: 'ACTIVE', deletedAt: null }, select: { id: true, contentType: true } });
  if (!f || !f.contentType.startsWith('image/')) throw errors.validation('Upload an image as the cover.', { field: 'coverFileId' });
  return f.id;
}

async function assertAuthor(me: AuthenticatedPrincipal) {
  if (!can(me, WRITE)) throw errors.forbidden(WRITE);
  const dentist = await db().dentistProfile.findFirst({ where: { userId: me.userId, isVerified: true, deletedAt: null }, select: { id: true } });
  if (!dentist) throw errors.preconditionFailed('Articles are written by dentists whose credentials Toothlogy has verified.');
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'article';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  while ((await db().article.count({ where: { slug } })) > 0) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  return slug;
}

// ---------------------------------------------------------------------------
// Authors
// ---------------------------------------------------------------------------

export async function createArticle(principal: Principal, raw: z.input<typeof articleSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  await assertAuthor(me);
  const input = parse(articleSchema, raw);
  checkText(input);
  checkSpecialty(input.specialtyKey);
  const now = context.now ?? new Date();
  if ((await db().article.count({ where: { authorUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } })) >= DRAFTS_PER_DAY) throw errors.rateLimited(3600);
  const [treatmentId, coverFileId] = await Promise.all([resolveTreatment(input.treatmentKey), resolveCover(me.userId, input.coverFileId)]);
  const id = newId('article');
  const slug = await uniqueSlug(slugify(input.title));
  await db().article.create({
    data: { id, slug, kind: input.kind, title: input.title, summary: input.summary, body: input.body, citations: input.citations as unknown as Prisma.InputJsonValue, treatmentId, specialtyKey: input.specialtyKey ?? null, coverFileId, authorUserId: me.userId, status: 'DRAFT', createdAt: now },
  });
  await recordAuditEvent({ action: 'ARTICLE_CREATED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId });
  return { articleId: id, slug };
}

/**
 * The author edits the working copy. Editing an article under review takes it
 * back to draft; editing a published one starts a revision (the reviewed
 * version stays up). Kind, treatment, specialty and cover are fixed once
 * published.
 */
export async function updateArticle(principal: Principal, articleId: string, raw: z.input<typeof articleUpdateSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = parse(articleUpdateSchema, raw);
  checkText(input);
  checkSpecialty(input.specialtyKey);
  const a = await db().article.findUnique({ where: { id: articleId } });
  if (!a || a.authorUserId !== me.userId) throw errors.notFound('Article');
  if (a.status === 'ARCHIVED') throw errors.preconditionFailed('This article is archived.');
  if (a.publishedAt) {
    const fixed = (['kind', 'treatmentKey', 'specialtyKey', 'coverFileId'] as const).find((f) => input[f] !== undefined);
    if (fixed && !(fixed === 'kind' && input.kind === a.kind)) throw errors.validation('This cannot change once the article is published.', { field: fixed });
  }
  const data: Prisma.ArticleUpdateManyMutationInput & { treatmentId?: string | null; coverFileId?: string | null } = {};
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.body !== undefined) data.body = input.body;
  if (input.citations !== undefined) data.citations = input.citations as unknown as Prisma.InputJsonValue;
  if (input.specialtyKey !== undefined) data.specialtyKey = input.specialtyKey || null;
  if (input.treatmentKey !== undefined) data.treatmentId = await resolveTreatment(input.treatmentKey || undefined);
  if (input.coverFileId !== undefined) data.coverFileId = await resolveCover(me.userId, input.coverFileId || undefined);
  const status = a.status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'DRAFT';
  const moved = await db().article.updateMany({ where: { id: a.id, status: a.status }, data: { ...data, status } });
  if (moved.count === 0) throw errors.conflict('This article changed at the same moment. Refresh and try again.');
  await recordAuditEvent({ action: 'ARTICLE_EDITED', actor: me.userId, subject: a.id, outcome: 'success', requestId: context.requestId });
  return { status };
}

export async function submitArticle(principal: Principal, articleId: string, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const a = await db().article.findUnique({ where: { id: articleId } });
  if (!a || a.authorUserId !== me.userId) throw errors.notFound('Article');
  if (a.status !== 'DRAFT' && a.status !== 'CHANGES_REQUESTED') throw errors.conflict(a.status === 'IN_REVIEW' ? 'It is already with a reviewer.' : 'There is nothing new to review.');
  const citations = a.citations as unknown as Citation[];
  if (CLINICAL_KINDS.has(a.kind) && citations.length === 0) throw errors.validation('A clinical article cites at least one source.', { field: 'citations' });
  const moved = await db().article.updateMany({ where: { id: a.id, status: a.status }, data: { status: 'IN_REVIEW', submittedAt: context.now ?? new Date() } });
  if (moved.count === 0) throw errors.conflict('This article changed at the same moment. Refresh and try again.');
  await recordAuditEvent({ action: 'ARTICLE_SUBMITTED', actor: me.userId, subject: a.id, outcome: 'success', requestId: context.requestId });
  return { status: 'IN_REVIEW' as const };
}

export const archiveSchema = z.object({ reason: z.string().trim().min(5, 'Say why, in a few words.').max(300) });

/** The author or a reviewer takes an article off the site. */
export async function archiveArticle(principal: Principal, articleId: string, raw: z.input<typeof archiveSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(archiveSchema, raw);
  const a = await db().article.findUnique({ where: { id: articleId }, select: { id: true, authorUserId: true, status: true, title: true } });
  const isAuthor = a?.authorUserId === me.userId;
  if (!a || (!isAuthor && !can(me, REVIEW))) throw errors.notFound('Article');
  const moved = await db().article.updateMany({ where: { id: a.id, status: { not: 'ARCHIVED' } }, data: { status: 'ARCHIVED', archivedAt: context.now ?? new Date(), archivedReason: input.reason } });
  if (moved.count === 0) throw errors.conflict('It is already archived.');
  await recordAuditEvent({ action: 'ARTICLE_ARCHIVED', actor: me.userId, subject: a.id, outcome: 'success', requestId: context.requestId, detail: { byAuthor: isAuthor } });
  if (!isAuthor) await notifyUser({ userId: a.authorUserId, notificationId: 'TL-NOTIF-ARTICLE-REVIEWED-001', data: { title: a.title, outcome: `was taken off Toothlogy: ${input.reason}` }, linkUrl: `/account/articles/${a.id}`, requestId: context.requestId });
  return { status: 'ARCHIVED' as const };
}

export async function myArticles(principal: Principal) {
  const me = signedIn(principal);
  return db().article.findMany({
    where: { authorUserId: me.userId },
    select: { id: true, slug: true, kind: true, title: true, status: true, reviewNote: true, liveTitle: true, updatedAt: true, publishedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/** The working copy, for its author or a reviewer. */
export async function articleForEditing(principal: Principal, articleId: string) {
  const me = signedIn(principal);
  const a = await db().article.findUnique({
    where: { id: articleId },
    include: { author: { select: { displayName: true } }, reviewer: { select: { displayName: true } }, treatment: { select: { key: true, name: true } } },
  });
  const isAuthor = a?.authorUserId === me.userId;
  if (!a || (!isAuthor && !can(me, REVIEW))) throw errors.notFound('Article');
  return { article: { ...a, citations: a.citations as unknown as Citation[] }, isAuthor, canReview: !isAuthor && can(me, REVIEW) && a.status === 'IN_REVIEW' };
}

// ---------------------------------------------------------------------------
// Reviewers
// ---------------------------------------------------------------------------

export async function reviewQueue(principal: Principal) {
  const me = signedIn(principal);
  if (!can(me, REVIEW)) throw errors.forbidden(REVIEW);
  return db().article.findMany({
    where: { status: 'IN_REVIEW' },
    select: { id: true, kind: true, title: true, submittedAt: true, publishedAt: true, authorUserId: true, author: { select: { displayName: true } } },
    orderBy: { submittedAt: 'asc' },
  });
}

export const reviewSchema = z.object({ decision: z.enum(['PUBLISH', 'REQUEST_CHANGES']), note: z.string().trim().max(1000).optional() });

export async function reviewArticle(principal: Principal, articleId: string, raw: z.input<typeof reviewSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  if (!can(me, REVIEW)) throw errors.forbidden(REVIEW);
  const input = parse(reviewSchema, raw);
  const now = context.now ?? new Date();
  const a = await db().article.findUnique({ where: { id: articleId } });
  if (!a) throw errors.notFound('Article');
  if (a.authorUserId === me.userId) throw errors.preconditionFailed('Someone else reviews your own articles.');
  if (a.status !== 'IN_REVIEW') throw errors.conflict('This article is not waiting for review.');
  const publish = input.decision === 'PUBLISH';
  if (!publish && (input.note ?? '').length < 10) throw errors.validation('Tell the author what to change (10 characters or more).', { field: 'note' });
  const moved = await db().article.updateMany({
    where: { id: a.id, status: 'IN_REVIEW' },
    data: publish
      ? { status: 'PUBLISHED', liveTitle: a.title, liveSummary: a.summary, liveBody: a.body, liveCitations: a.citations as Prisma.InputJsonValue, publishedAt: a.publishedAt ?? now, lastReviewedAt: now, reviewedByUserId: me.userId, reviewNote: input.note || null }
      : { status: 'CHANGES_REQUESTED', reviewNote: input.note ?? null },
  });
  if (moved.count === 0) throw errors.conflict('This article changed at the same moment. Refresh and try again.');
  await recordAuditEvent({ action: publish ? 'ARTICLE_PUBLISHED' : 'ARTICLE_CHANGES_REQUESTED', actor: me.userId, subject: a.id, outcome: 'success', requestId: context.requestId });
  await notifyUser({
    userId: a.authorUserId,
    notificationId: 'TL-NOTIF-ARTICLE-REVIEWED-001',
    data: { title: a.title, outcome: publish ? 'was reviewed and published' : 'needs changes before it can be published' },
    linkUrl: publish ? `/knowledge/${a.slug}` : `/account/articles/${a.id}`,
    requestId: context.requestId,
  });
  return { status: publish ? ('PUBLISHED' as const) : ('CHANGES_REQUESTED' as const), slug: a.slug };
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(KINDS).optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

const LIVE: Prisma.ArticleWhereInput = { liveTitle: { not: null }, status: { not: 'ARCHIVED' } };

export async function listArticles(raw: z.input<typeof listSchema>) {
  const input = parse(listSchema, raw);
  const page = input.page ?? 1;
  const where: Prisma.ArticleWhereInput = {
    ...LIVE,
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.q
      ? { OR: [{ liveTitle: { contains: input.q, mode: 'insensitive' } }, { liveSummary: { contains: input.q, mode: 'insensitive' } }, { treatment: { name: { contains: input.q, mode: 'insensitive' } } }] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db().article.findMany({ where, orderBy: { lastReviewedAt: 'desc' }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, select: { slug: true, kind: true, liveTitle: true, liveSummary: true, lastReviewedAt: true, author: { select: { displayName: true } } } }),
    db().article.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ slug: r.slug, kind: r.kind, title: r.liveTitle!, summary: r.liveSummary!, reviewedAt: r.lastReviewedAt, author: r.author.displayName ?? 'Dentist' })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** The reviewed version of a published article, or null. */
export async function getArticle(slug: string) {
  const a = await db().article.findUnique({
    where: { slug },
    include: {
      author: { select: { displayName: true, dentistProfile: { select: { slug: true, isDiscoverable: true } } } },
      reviewer: { select: { displayName: true } },
      treatment: { select: { key: true, name: true } },
    },
  });
  if (!a || !a.liveTitle || a.status === 'ARCHIVED') return null;
  return {
    slug: a.slug,
    kind: a.kind,
    title: a.liveTitle,
    summary: a.liveSummary ?? '',
    body: a.liveBody ?? '',
    citations: (a.liveCitations ?? []) as unknown as Citation[],
    publishedAt: a.publishedAt,
    reviewedAt: a.lastReviewedAt,
    author: { name: a.author.displayName ?? 'Dentist', profileSlug: a.author.dentistProfile?.isDiscoverable ? a.author.dentistProfile.slug : null },
    reviewer: a.reviewer?.displayName ?? null,
    treatment: a.treatment,
    specialtyKey: a.specialtyKey,
    coverFileId: a.coverFileId,
  };
}

/**
 * Up to three other live articles about the same treatment, then the same
 * specialty, then the same kind — each with the reason it is shown. A fixed
 * rule, not a model or a profile of the reader: everyone sees the same.
 */
export async function relatedArticles(slug: string, limit = 3): Promise<Array<{ slug: string; title: string; summary: string; reason: string }>> {
  const article = await db().article.findUnique({ where: { slug }, select: { id: true, kind: true, treatmentId: true, specialtyKey: true, treatment: { select: { name: true } } } });
  if (!article) return [];
  const tiers: Array<{ where: Prisma.ArticleWhereInput; reason: string }> = [
    ...(article.treatmentId ? [{ where: { treatmentId: article.treatmentId }, reason: `Also about ${article.treatment?.name ?? 'this treatment'}` }] : []),
    ...(article.specialtyKey ? [{ where: { specialtyKey: article.specialtyKey }, reason: 'Same field of dentistry' }] : []),
    { where: { kind: article.kind }, reason: 'Same kind of article' },
  ];
  const out: Array<{ slug: string; title: string; summary: string; reason: string }> = [];
  const seen = new Set<string>([article.id]);
  for (const tier of tiers) {
    if (out.length >= limit) break;
    const rows = await db().article.findMany({ where: { ...LIVE, ...tier.where, id: { notIn: [...seen] } }, orderBy: { lastReviewedAt: 'desc' }, take: limit - out.length, select: { id: true, slug: true, liveTitle: true, liveSummary: true } });
    for (const r of rows) {
      seen.add(r.id);
      out.push({ slug: r.slug, title: r.liveTitle!, summary: r.liveSummary ?? '', reason: tier.reason });
    }
  }
  return out;
}

/** Slugs of what is live, for the sitemap. */
export async function liveArticleSlugs(limit = 5000) {
  return db().article.findMany({ where: LIVE, select: { slug: true, lastReviewedAt: true }, orderBy: { lastReviewedAt: 'desc' }, take: limit });
}
