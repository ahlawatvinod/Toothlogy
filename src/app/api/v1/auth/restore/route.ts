/**
 * TL-API-AUTH-RESTORE-001 — POST /api/v1/auth/restore
 *
 * Cancel a pending account deletion and sign in, during the grace period.
 *
 * Takes credentials rather than a session because an account awaiting deletion
 * has no sessions — requesting deletion signed it out everywhere. Every failure
 * returns the ordinary login failure, so this endpoint cannot be used to learn
 * which accounts are pending deletion.
 */

import { loginSchema, restoreAccount } from '@/platform/auth/service';
import { MFA_CHALLENGE_COOKIE, setLoginResultCookies } from '@/platform/auth/cookies';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AUTH-RESTORE-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema: loginSchema,
  audit: true,
  handler: async ({ body, ipAddress, userAgent, requestId, setCookie }) => {
    const result = await restoreAccount(body, { ipAddress, userAgent, requestId });
    setLoginResultCookies(result, setCookie);
    return result.kind === 'mfa_required'
      ? { restored: true, mfaRequired: true, challengeCookie: MFA_CHALLENGE_COOKIE }
      : { restored: true, mfaRequired: false, userId: result.userId };
  },
});
