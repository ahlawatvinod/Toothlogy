/**
 * TL-API-AUTH-LOGIN-001 — POST /api/v1/auth/login
 *
 * Rate limited on `auth-strict` (5/minute per IP). That limit, plus the
 * per-identifier lockout in the service, is the defence against credential
 * stuffing: the IP limit stops one source spraying many accounts, and the
 * identifier lockout stops many sources targeting one account.
 *
 * For an account with two-step verification, a correct password does NOT sign
 * the user in. It sets a five-minute challenge cookie scoped to the MFA
 * endpoint, and the response says a code is required. The challenge is an
 * HttpOnly cookie rather than a token in the body for the same reason the
 * session is: script on the page must never be able to read it.
 */

import { login, loginSchema } from '@/platform/auth/service';
import { MFA_CHALLENGE_COOKIE, setLoginResultCookies } from '@/platform/auth/cookies';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AUTH-LOGIN-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema: loginSchema,
  audit: true,
  handler: async ({ body, ipAddress, userAgent, requestId, setCookie }) => {
    const result = await login(body, { ipAddress, userAgent, requestId });
    setLoginResultCookies(result, setCookie);

    // The session token is set as an HttpOnly cookie and deliberately NOT
    // returned in the body: a token in a JSON response invites a client to
    // store it in localStorage, where any XSS can read it.
    return result.kind === 'mfa_required'
      ? { mfaRequired: true, challengeCookie: MFA_CHALLENGE_COOKIE, expiresAt: result.expiresAt }
      : { mfaRequired: false, userId: result.userId, expiresAt: result.session.expiresAt };
  },
});
