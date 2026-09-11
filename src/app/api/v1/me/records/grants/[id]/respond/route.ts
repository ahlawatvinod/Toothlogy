/**
 * TL-API-RECORD-GRANT-RESPOND-001 — POST /api/v1/me/records/grants/:id/respond { decision, canWrite?, days? }
 *
 * The patient allows or declines a practice's request to see their record.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { respondSchema, respondToRequest } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RECORD-GRANT-RESPOND-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: respondSchema,
  audit: true,
  handler: async ({ principal, params, body, ipAddress, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Request id is required.');
    return respondToRequest(principal, params.id, body, { ipAddress, requestId });
  },
});
