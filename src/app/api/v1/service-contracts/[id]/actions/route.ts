/**
 * TL-API-SERVICE-CONTRACT-ACTION-001 — POST /api/v1/service-contracts/:id/actions
 *   practice: { action: ACCEPT, assetIds? } | { action: DECLINE, note }
 *   either:   { action: CANCEL, note }
 */

import { actOnContract, contractActionSchema } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-SERVICE-CONTRACT-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: contractActionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Contract id is required.');
    return actOnContract(principal, params.id, body, { requestId });
  },
});
