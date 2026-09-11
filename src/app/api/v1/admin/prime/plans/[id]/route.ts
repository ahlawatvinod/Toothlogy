/**
 * TL-API-PRIME-PLAN-UPDATE-001 — PATCH /api/v1/admin/prime/plans/:id
 *   draft fields, and/or { action: ACTIVATE | RETIRE }
 *
 * Edit a draft; put it on sale once its tax is configured; retire a plan on
 * sale (current periods run to their end and do not renew).
 */

import { planUpdateSchema, updatePlan } from '@/platform/prime/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-PRIME-PLAN-UPDATE-001',
  permissions: ['tl.prime.plan.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: planUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Plan id is required.');
    return jsonSafe(await updatePlan(principal, params.id, body, { requestId }));
  },
});
