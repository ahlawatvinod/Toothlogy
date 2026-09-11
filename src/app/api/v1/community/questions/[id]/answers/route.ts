/**
 * TL-API-COMMUNITY-ANSWER-001 — POST /api/v1/community/questions/:id/answers { body }
 *
 * Answer a published question. Signed in, verified email, 30 a day; the
 * asker is told.
 */

import { answerQuestion, answerSchema } from '@/platform/community/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COMMUNITY-ANSWER-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: answerSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Question id is required.');
    return answerQuestion(principal, params.id, body, { requestId });
  },
});
