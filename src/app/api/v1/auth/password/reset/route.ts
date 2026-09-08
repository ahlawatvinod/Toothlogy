/**
 * TL-API-AUTH-RESET-001 — POST /api/v1/auth/password/reset
 *
 * Completes a password reset with a token.
 *
 * Revokes every session on success. Password reset is the flow a compromised
 * user goes through; leaving the attacker's session alive would defeat it.
 */

import { z } from 'zod';
import { completePasswordReset } from '@/platform/auth/service';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/platform/auth/password';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  token: z.string().min(1, 'The reset link is missing its token.'),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH),
});

export const POST = defineRoute({
  id: 'TL-API-AUTH-RESET-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ body, ipAddress, requestId }) => {
    const result = await completePasswordReset(body.token, body.password, {
      requestId,
      ipAddress,
    });

    return {
      passwordChanged: true,
      // Surfaced so the UI can say "you have been signed out on N other
      // devices" — which is how a user notices sessions they did not create.
      sessionsRevoked: result.sessionsRevoked,
    };
  },
});
