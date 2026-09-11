/**
 * TL-API-KNOWLEDGE-GET-001 — GET /api/v1/knowledge/:slug
 *
 * The reviewed version of a published article. Drafts, revisions not yet
 * approved and archived articles do not exist here.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { getArticle } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-KNOWLEDGE-GET-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params }) => {
    if (typeof params.slug !== 'string') throw errors.validation('Article is required.');
    const article = await getArticle(params.slug);
    if (!article) throw errors.notFound('Article');
    return article;
  },
});
