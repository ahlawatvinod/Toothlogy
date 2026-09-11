/**
 * TL-API-PRACTICE-THREADS-001 — GET /api/v1/organizations/:id/messages
 *
 * A practice's conversations with its patients. Checks
 * tl.messaging.thread.read on the practice.
 */

import { listPracticeThreads } from '@/platform/messaging/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRACTICE-THREADS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return { threads: await listPracticeThreads(principal, params.id) };
  },
});
