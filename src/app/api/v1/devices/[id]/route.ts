/**
 * TL-API-DEVICE-GET-001 — GET /api/v1/devices/:id
 *
 * One device with its limits, latest and recent readings and alerts
 * (tl.iot.device.read on its organization).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { deviceDetail } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-DEVICE-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Device id is required.');
    return deviceDetail(principal, params.id);
  },
});
