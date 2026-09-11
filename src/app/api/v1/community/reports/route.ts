/**
 * TL-API-COMMUNITY-REPORT-001 — POST /api/v1/community/reports { targetType, targetId, reason, note? }
 *
 * Report a post once; three open reports hide it until a moderator looks.
 */

import { reportPost, reportSchema } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-REPORT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: reportSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => reportPost(principal, body, { requestId }),
});
