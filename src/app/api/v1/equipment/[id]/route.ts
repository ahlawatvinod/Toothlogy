/**
 * TL-API-EQUIPMENT-UPDATE-001 — PATCH /api/v1/equipment/:id
 *
 * Change a piece of equipment's details, or retire it. Checks
 * tl.equipment.asset.manage on the practice that owns it.
 */

import { assetUpdateSchema, updateAsset } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-EQUIPMENT-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: assetUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Equipment id is required.');
    return jsonSafe(await updateAsset(principal, params.id, body, { requestId }));
  },
});
