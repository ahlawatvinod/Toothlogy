/**
 * TL-API-ARTICLE-CREATE-001 — POST /api/v1/articles
 *
 * A dentist whose credentials Toothlogy has verified starts a draft. Nothing
 * is public until another person reviews it.
 */

import { defineRoute } from '@/platform/http/handler';
import { articleSchema, createArticle } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ARTICLE-CREATE-001',
  permissions: ['tl.knowledge.article.write'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: articleSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => createArticle(principal, body, { requestId }),
});
