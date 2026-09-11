/**
 * TL-API-ARTICLE-REVIEW-001 — POST /api/v1/admin/articles/:id/review { decision, note? }
 *
 * A reviewer publishes the working copy (it becomes what readers see) or
 * asks for changes with a note. Never one's own article.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { reviewArticle, reviewSchema } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ARTICLE-REVIEW-001',
  permissions: ['tl.knowledge.article.review'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: reviewSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Article id is required.');
    return reviewArticle(principal, params.id, body, { requestId });
  },
});
