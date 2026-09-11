/**
 * TL-API-THREAD-GET-001   — GET  /api/v1/messages/threads/:id          (the patient, or practice members who may read)
 * TL-API-MESSAGE-POST-001 — POST /api/v1/messages/threads/:id { body }  (the patient, or practice members who may reply)
 *
 * Reading marks the conversation read for the reader's side. Anyone else is
 * told it does not exist.
 */

import { getThread, messageSchema, postMessage } from '@/platform/messaging/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-THREAD-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Conversation id is required.');
    return getThread(principal, params.id);
  },
});

export const POST = defineRoute({
  id: 'TL-API-MESSAGE-POST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: messageSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Conversation id is required.');
    return postMessage(principal, params.id, body, { requestId });
  },
});
