/**
 * TL-API-DEVICE-TELEMETRY-001 — POST /api/v1/devices/telemetry
 *   Authorization: Device <token>
 *   { readings: [{ metric, value, at? }] }   (1–100)
 *
 * Called by the device itself, which has no session: the route is registered
 * without a permission and the service authenticates the token (compared by
 * hash) before anything is stored. Unknown or retired tokens are refused.
 */

import { defineRoute } from '@/platform/http/handler';
import { ingestTelemetry, telemetrySchema } from '@/platform/devices/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-DEVICE-TELEMETRY-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  bodySchema: telemetrySchema,
  audit: false,
  handler: async ({ request, body, requestId }) => ingestTelemetry(request.headers.get('authorization'), body, { requestId }),
});
