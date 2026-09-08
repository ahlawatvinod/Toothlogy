/**
 * TL-API-AUTH-VERIFY-001 — POST /api/v1/auth/verify
 *
 * Confirms an email address or phone number from a verification token.
 *
 * Not authenticated: verification links are opened from an email client, often
 * on a different device from the one that registered, where no session cookie
 * exists. The token is the credential.
 */

import { z } from 'zod';
import { verifyContact } from '@/platform/auth/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(1, 'The verification link is missing its token.'),
  type: z.enum(['EMAIL_VERIFICATION', 'PHONE_VERIFICATION']).default('EMAIL_VERIFICATION'),
});

export const POST = defineRoute({
  id: 'TL-API-AUTH-VERIFY-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ body, requestId }) => {
    const result = await verifyContact(body.token, body.type, { requestId });
    return { verified: true, userId: result.userId };
  },
});
