/**
 * TL-API-SERVICE-VISIT-REQUEST-001 — POST /api/v1/service-contracts/:id/visits
 *   { kind: PREVENTIVE | BREAKDOWN, assetId?, issue? }
 *
 * The practice requests a visit while the contract runs. Requires an
 * Idempotency-Key, so a retried request cannot use up two preventive visits.
 */

import { requestVisit, visitRequestSchema } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-SERVICE-VISIT-REQUEST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: visitRequestSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Contract id is required.');
    return requestVisit(principal, params.id, body, { requestId });
  },
});
