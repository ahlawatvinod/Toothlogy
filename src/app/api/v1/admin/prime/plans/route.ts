/**
 * TL-API-PRIME-PLANS-001       — GET  /api/v1/admin/prime/plans
 * TL-API-PRIME-PLAN-CREATE-001 — POST /api/v1/admin/prime/plans
 *
 * Prime plans for staff (tl.prime.plan.manage): every plan with its current
 * members and price with tax, and creating a draft. The price, period and
 * benefits are entered here — configuration, never code.
 */

import { createPlan, listPlans, planSchema } from '@/platform/prime/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRIME-PLANS-001',
  permissions: ['tl.prime.plan.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => jsonSafe(await listPlans(principal)),
});

export const POST = defineRoute({
  id: 'TL-API-PRIME-PLAN-CREATE-001',
  permissions: ['tl.prime.plan.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: planSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => createPlan(principal, body, { requestId }),
});
