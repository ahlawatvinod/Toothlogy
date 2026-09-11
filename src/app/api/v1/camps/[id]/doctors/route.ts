/**
 * TL-API-CAMP-APPLY-001 — POST /api/v1/camps/:id/doctors { message? }
 *
 * A verified dentist applies to serve at a submitted or approved camp.
 */

import { applySchema, applyToCamp } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-APPLY-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: applySchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    return applyToCamp(principal, params.id, body, { requestId });
  },
});
