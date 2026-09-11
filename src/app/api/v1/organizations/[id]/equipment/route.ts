/**
 * TL-API-EQUIPMENT-CONSOLE-001 — GET  /api/v1/organizations/:id/equipment
 * TL-API-EQUIPMENT-ADD-001     — POST /api/v1/organizations/:id/equipment
 *
 * A practice's equipment register, contracts and visits (tl.equipment.asset.read),
 * and adding equipment to it (tl.equipment.asset.manage).
 */

import { addAsset, assetSchema, equipmentConsole } from '@/platform/equipment/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-EQUIPMENT-CONSOLE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await equipmentConsole(principal, params.id));
  },
});

export const POST = defineRoute({
  id: 'TL-API-EQUIPMENT-ADD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: assetSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return addAsset(principal, params.id, body, { requestId });
  },
});
