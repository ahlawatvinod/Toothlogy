/**
 * TL-API-COMMUNITY-ASK-001 — POST /api/v1/community/questions { topic, title, body }
 *
 * Ask the community. Signed in, verified email, 5 a day; phone numbers and
 * email addresses are refused.
 */

import { askQuestion, questionSchema } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-ASK-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: questionSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => askQuestion(principal, body, { requestId }),
});
