/**
 * TL-API-KNOWLEDGE-LIST-001 — GET /api/v1/knowledge?q=&kind=&page=
 *
 * Published, reviewed articles, newest review first; search by title, summary
 * or treatment, filter by kind. Public.
 */

import { defineRoute } from '@/platform/http/handler';
import { listArticles } from '@/platform/knowledge/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-KNOWLEDGE-LIST-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ request }) => {
    const params = new URL(request.url).searchParams;
    return listArticles({ q: params.get('q') || undefined, kind: (params.get('kind') || undefined) as never, page: params.get('page') || undefined });
  },
});
