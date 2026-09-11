/**
 * TL-API-COMMUNITY-REMOVE-001 — POST /api/v1/community/posts/remove { targetType: QUESTION | ANSWER, targetId }
 *
 * The author removes their own post; its text is cleared.
 */

import { removeOwnPost, targetSchema } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-REMOVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: targetSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    await removeOwnPost(principal, body, { requestId });
    return { removed: true };
  },
});
