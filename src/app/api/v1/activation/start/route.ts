/**
 * TL-API-ACTIVATION-START-001 — POST /api/v1/activation/start { email, phone }
 *
 * Begin activating a pre-made profile: a link to the email, a code to the
 * mobile. The answer is identical whether or not a profile matches, and the
 * route is rate-limited as costly — it sends an SMS.
 */

import { startActivation, startActivationSchema } from '@/platform/india-data/activation';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ACTIVATION-START-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'costly',
  bodySchema: startActivationSchema,
  audit: true,
  handler: async ({ body, requestId, request }) =>
    startActivation(body, { requestId, ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null }),
});
