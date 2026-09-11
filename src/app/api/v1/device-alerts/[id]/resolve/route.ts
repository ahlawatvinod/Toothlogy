/**
 * TL-API-DEVICE-ALERT-RESOLVE-001 — POST /api/v1/device-alerts/:id/resolve { note? }
 *
 * A person resolves an equipment alert (tl.iot.device.manage); alerts never
 * clear themselves.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { resolveAlert, resolveSchema } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DEVICE-ALERT-RESOLVE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: resolveSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Alert id is required.');
    return resolveAlert(principal, params.id, body, { requestId });
  },
});
