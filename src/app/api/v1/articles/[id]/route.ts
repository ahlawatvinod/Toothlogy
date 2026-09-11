/**
 * TL-API-ARTICLE-GET-001    — GET   /api/v1/articles/:id  (the author, or a reviewer)
 * TL-API-ARTICLE-UPDATE-001 — PATCH /api/v1/articles/:id  (the author)
 *
 * The working copy. Editing a published article starts a revision; readers
 * keep seeing the reviewed version until the revision is approved.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { articleForEditing, articleUpdateSchema, updateArticle } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ARTICLE-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Article id is required.');
    return articleForEditing(principal, params.id);
  },
});

export const PATCH = defineRoute({
  id: 'TL-API-ARTICLE-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: articleUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Article id is required.');
    return updateArticle(principal, params.id, body, { requestId });
  },
});
