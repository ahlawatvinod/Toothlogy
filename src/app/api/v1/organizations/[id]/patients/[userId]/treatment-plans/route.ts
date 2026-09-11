/**
 * TL-API-TREATMENT-PLAN-PROPOSE-001 — POST /api/v1/organizations/:id/patients/:userId/treatment-plans
 *
 * The practice proposes a treatment plan under a grant that allows adding.
 * Idempotent by key: a retried request returns the same plan.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { planSchema, proposePlan } from '@/platform/records/treatment-plans';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TREATMENT-PLAN-PROPOSE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: planSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.userId !== 'string') throw errors.validation('Organization and patient are required.');
    return proposePlan(principal, params.id, params.userId, body, { requestId });
  },
});
