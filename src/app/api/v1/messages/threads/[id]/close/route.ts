/**
 * TL-API-THREAD-CLOSE-001 — POST /api/v1/messages/threads/:id/close
 *
 * Either side closes a conversation; it then takes no more messages.
 */

import { closeThread } from '@/platform/messaging/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-THREAD-CLOSE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Conversation id is required.');
    await closeThread(principal, params.id, { requestId });
    return { closed: true };
  },
});
