/**
 * TL-API-ARTICLE-SUBMIT-001 — POST /api/v1/articles/:id/submit
 *
 * The author sends the working copy for clinical review. Clinical kinds must
 * cite at least one source.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { submitArticle } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ARTICLE-SUBMIT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Article id is required.');
    return submitArticle(principal, params.id, { requestId });
  },
});
