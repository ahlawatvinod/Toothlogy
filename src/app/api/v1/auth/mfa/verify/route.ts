/**
 * TL-API-AUTH-MFA-VERIFY-001 — POST /api/v1/auth/mfa/verify
 *
 * The second step of signing in to an account with two-step verification:
 * redeem the challenge cookie set by login with an authenticator code or a
 * recovery code, and receive a session.
 *
 * The challenge comes from an HttpOnly cookie scoped to this path, never from
 * the body, so page script cannot read or forge it.
 */

import { z } from 'zod';
import { completeMfaChallenge } from '@/platform/auth/mfa';
import {
  MFA_CHALLENGE_COOKIE,
  clearMfaChallengeCookie,
  setSessionCookie,
} from '@/platform/auth/cookies';
import { defineRoute, readCookie } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app.').optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.recoveryCode), {
    message: 'Enter either a code from your app or a recovery code.',
    path: ['code'],
  });

export const POST = defineRoute({
  id: 'TL-API-AUTH-MFA-VERIFY-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ request, body, ipAddress, userAgent, requestId, setCookie, clearCookie }) => {
    const challenge = readCookie(request, MFA_CHALLENGE_COOKIE);
    if (!challenge) {
      throw errors.validation('This sign-in has expired. Enter your password again.', {
        field: 'challenge',
      });
    }

    const result = await completeMfaChallenge(
      challenge,
      { code: body.code, recoveryCode: body.recoveryCode },
      { ipAddress, userAgent, requestId },
    );

    setSessionCookie(result.session, setCookie);
    clearMfaChallengeCookie(clearCookie);

    return { userId: result.userId, expiresAt: result.session.expiresAt };
  },
});
