/**
 * TL-API-TREATMENT-PLAN-ITEM-001 — POST /api/v1/treatment-plans/:id/items/:itemId
 *
 * The proposing practice records one treatment as done, or not done with a
 * reason. The plan completes when nothing is left.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { actOnPlanItem, itemActionSchema } from '@/platform/records/treatment-plans';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-TREATMENT-PLAN-ITEM-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: itemActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.itemId !== 'string') throw errors.validation('Treatment plan and treatment are required.');
    return actOnPlanItem(principal, params.id, params.itemId, body, { requestId });
  },
});
