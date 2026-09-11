/**
 * TL-API-ACTIVATION-COMPLETE-001 — POST /api/v1/activation/complete { token, code, password, acceptedTerms }
 *
 * Finish activation: the email link's token and the mobile code, both, then
 * a password. Once only. The person then signs in normally.
 */

import { completeActivation, completeActivationSchema } from '@/platform/india-data/activation';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ACTIVATION-COMPLETE-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'costly',
  bodySchema: completeActivationSchema,
  audit: true,
  handler: async ({ body, requestId }) => completeActivation(body, { requestId }),
});
