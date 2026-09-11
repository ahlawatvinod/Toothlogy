/**
 * TL-API-AI-ARTICLE-SUMMARY-001 — POST /api/v1/ai/article-summaries { slug, locale? }
 *
 * A labelled, plain-language AI summary of a published, reviewed article —
 * the one AI purpose allowed (Constitution §5). 503 NOT_CONFIGURED while no
 * model provider is connected. Audited without the text.
 */

import { defineRoute } from '@/platform/http/handler';
import { summariseArticle, summarySchema } from '@/platform/ai/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AI-ARTICLE-SUMMARY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: summarySchema,
  audit: false,
  handler: async ({ principal, body, requestId }) => summariseArticle(principal, body, { requestId }),
});
