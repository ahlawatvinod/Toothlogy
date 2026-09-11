/**
 * TL-API-CAMP-REGISTER-001 — POST /api/v1/camps/:id/registrations { consentToShare: true, phone?, age?, concern? }
 *
 * A signed-in patient registers for an approved camp. One registration per
 * phone and per account; capacity is enforced.
 */

import { registerForCamp, selfRegistrationSchema } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-REGISTER-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: selfRegistrationSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Camp id is required.');
    return registerForCamp(principal, params.id, body, { requestId });
  },
});
