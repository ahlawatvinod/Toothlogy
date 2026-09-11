/**
 * TL-API-SERVICE-VISIT-ACTION-001 — POST /api/v1/service-visits/:id/actions
 *   business: { action: SCHEDULE, scheduledFor } | { action: COMPLETE, report }
 *   practice: { action: CANCEL, note }
 */

import { actOnVisit, visitActionSchema } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-SERVICE-VISIT-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: visitActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Visit id is required.');
    return actOnVisit(principal, params.id, body, { requestId });
  },
});
