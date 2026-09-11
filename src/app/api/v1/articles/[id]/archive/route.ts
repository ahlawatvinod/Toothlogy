/**
 * TL-API-ARTICLE-ARCHIVE-001 — POST /api/v1/articles/:id/archive { reason }
 *
 * The author or a reviewer takes an article off Toothlogy. Nothing is deleted.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { archiveArticle, archiveSchema } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ARTICLE-ARCHIVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: archiveSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Article id is required.');
    return archiveArticle(principal, params.id, body, { requestId });
  },
});
