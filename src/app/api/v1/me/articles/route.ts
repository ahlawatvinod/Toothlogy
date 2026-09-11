/**
 * TL-API-MY-ARTICLES-001 — GET /api/v1/me/articles
 *
 * The author's drafts, articles under review and published articles.
 */

import { defineRoute } from '@/platform/http/handler';
import { myArticles } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-ARTICLES-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => myArticles(principal),
});
