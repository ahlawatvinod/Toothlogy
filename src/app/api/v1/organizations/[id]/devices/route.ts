/**
 * TL-API-DEVICES-LIST-001    — GET  /api/v1/organizations/:id/devices  (tl.iot.device.read)
 * TL-API-DEVICE-REGISTER-001 — POST /api/v1/organizations/:id/devices  (tl.iot.device.manage)
 *
 * Registering returns the device's token once; only its hash is kept.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { listDevices, registerDevice, registerSchema } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-DEVICES-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return listDevices(principal, params.id);
  },
});

export const POST = defineRoute({
  id: 'TL-API-DEVICE-REGISTER-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: registerSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return registerDevice(principal, params.id, body, { requestId });
  },
});
