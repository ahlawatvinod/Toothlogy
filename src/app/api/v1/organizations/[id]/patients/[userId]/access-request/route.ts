/**
 * TL-API-RECORD-ACCESS-REQUEST-001 — POST /api/v1/organizations/:id/patients/:userId/access-request { note? }
 *
 * The practice asks a patient it has an appointment with to share their
 * record. The patient is told; nothing is shared until they allow it.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { requestAccess, requestSchema } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RECORD-ACCESS-REQUEST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: requestSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.userId !== 'string') throw errors.validation('Organization and patient are required.');
    return requestAccess(principal, params.id, params.userId, body, { requestId });
  },
});
