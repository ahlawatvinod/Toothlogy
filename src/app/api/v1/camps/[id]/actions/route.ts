/**
 * TL-API-CAMP-ACTION-001 — POST /api/v1/camps/:id/actions { action: SUBMIT | APPROVE | REJECT | CANCEL | COMPLETE, note? }
 *
 * Organizer submits, cancels, completes; staff approve or reject — never
 * their own camp. Each only from the states it makes sense from.
 */

import { actOnCamp, campActionSchema } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    return actOnCamp(principal, params.id, body, { requestId });
  },
});
