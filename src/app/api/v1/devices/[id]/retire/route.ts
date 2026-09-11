/**
 * TL-API-DEVICE-RETIRE-001 — POST /api/v1/devices/:id/retire
 *
 * Retire a device: it can no longer report; its readings and alerts stay
 * (tl.iot.device.manage).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { retireDevice } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DEVICE-RETIRE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Device id is required.');
    return retireDevice(principal, params.id, { requestId });
  },
});
