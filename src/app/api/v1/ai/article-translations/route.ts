/**
 * TL-API-AI-ARTICLE-TRANSLATION-001 — POST /api/v1/ai/article-translations { slug, language }
 *
 * A labelled AI translation of a published, reviewed article into a language
 * Toothlogy offers (Constitution §5). 503 NOT_CONFIGURED while no model
 * provider is connected. Public reviewed text only; audited without it.
 */

import { defineRoute } from '@/platform/http/handler';
import { translateArticle, translationSchema } from '@/platform/ai/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AI-ARTICLE-TRANSLATION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: translationSchema,
  audit: false,
  handler: async ({ principal, body, requestId }) => translateArticle(principal, body, { requestId }),
});
