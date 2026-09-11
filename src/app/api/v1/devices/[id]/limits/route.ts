/**
 * TL-API-DEVICE-LIMITS-001 — PUT /api/v1/devices/:id/limits { limits: [{ metric, min?, max? }] }
 *
 * Replace the device's acceptable ranges (tl.iot.device.manage).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { limitsSchema, setLimits } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  id: 'TL-API-DEVICE-LIMITS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: limitsSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Device id is required.');
    return setLimits(principal, params.id, body, { requestId });
  },
});
