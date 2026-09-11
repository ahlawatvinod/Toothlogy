/**
 * TL-API-ARTICLE-QUEUE-001 — GET /api/v1/admin/articles
 *
 * Articles waiting for clinical review, oldest first.
 */

import { defineRoute } from '@/platform/http/handler';
import { reviewQueue } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ARTICLE-QUEUE-001',
  permissions: ['tl.knowledge.article.review'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => reviewQueue(principal),
});
