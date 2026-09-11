/**
 * TL-API-MY-THREADS-001 — GET /api/v1/me/messages
 *
 * The signed-in patient's conversations, newest first, with unread markers.
 */

import { listPatientThreads } from '@/platform/messaging/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-THREADS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ threads: await listPatientThreads(principal) }),
});
