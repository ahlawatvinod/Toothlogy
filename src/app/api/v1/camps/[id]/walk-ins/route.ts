/**
 * TL-API-CAMP-WALK-IN-001 — POST /api/v1/camps/:id/walk-ins { name, phone, consentToShare: true, age?, concern? }
 *
 * The organizer or a camp doctor records a patient at the venue.
 */

import { registerWalkIn, walkInSchema } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-WALK-IN-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: walkInSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    return registerWalkIn(principal, params.id, body, { requestId });
  },
});
