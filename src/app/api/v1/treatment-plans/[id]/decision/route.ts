/**
 * TL-API-TREATMENT-PLAN-DECIDE-001 — POST /api/v1/treatment-plans/:id/decision
 *
 * The patient accepts or declines a proposed plan, once.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { decidePlan, decisionSchema } from '@/platform/records/treatment-plans';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TREATMENT-PLAN-DECIDE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: decisionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Treatment plan is required.');
    return decidePlan(principal, params.id, body, { requestId });
  },
});
