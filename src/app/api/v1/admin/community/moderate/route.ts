/**
 * TL-API-COMMUNITY-MODERATE-001 — POST /api/v1/admin/community/moderate { targetType, targetId, action: HIDE | RESTORE, reason? }
 *
 * Moderators hide a post with the reason its author is told, or restore it;
 * the post's open reports are upheld or dismissed accordingly.
 */

import { moderatePost, moderationSchema } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-MODERATE-001',
  permissions: ['tl.community.post.moderate'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: moderationSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    await moderatePost(principal, body, { requestId });
    return { action: body.action };
  },
});
