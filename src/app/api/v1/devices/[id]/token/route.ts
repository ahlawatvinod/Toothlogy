/**
 * TL-API-DEVICE-TOKEN-001 — POST /api/v1/devices/:id/token
 *
 * Re-key a device: a new token, shown once; the old one stops working at once
 * (tl.iot.device.manage).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { rotateDeviceToken } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DEVICE-TOKEN-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Device id is required.');
    return rotateDeviceToken(principal, params.id, { requestId });
  },
});
