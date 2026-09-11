/**
 * TL-API-TREATMENT-PLAN-CANCEL-001 — POST /api/v1/treatment-plans/:id/cancel
 *
 * The proposing practice withdraws a proposed or accepted plan, with a reason
 * the patient sees.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { cancelPlan, cancelPlanSchema } from '@/platform/records/treatment-plans';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TREATMENT-PLAN-CANCEL-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: cancelPlanSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Treatment plan is required.');
    await cancelPlan(principal, params.id, body, { requestId });
    return { cancelled: true };
  },
});
