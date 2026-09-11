/**
 * TL-API-THREAD-START-001 — POST /api/v1/messages/threads { organizationId, appointmentId?, subject, body }
 *
 * A patient starts a conversation with a practice they have an appointment
 * with. One open conversation per patient, practice and appointment.
 */

import { startThread, startThreadSchema } from '@/platform/messaging/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-THREAD-START-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: startThreadSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => startThread(principal, body, { requestId }),
});
