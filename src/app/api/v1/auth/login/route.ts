/**
 * TL-API-AUTH-LOGIN-001 — POST /api/v1/auth/login
 *
 * Rate limited on `auth-strict` (5/minute per IP). That limit, plus the
 * per-identifier lockout in the service, is the defence against credential
 * stuffing: the IP limit stops one source spraying many accounts, and the
 * identifier lockout stops many sources targeting one account.
 */

import { login, loginSchema } from '@/platform/auth/service';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from '@/platform/auth/session';
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

    setCookie(SESSION_COOKIE, result.session.token, {
      maxAgeSeconds: SESSION_TTL_DAYS * 24 * 3600,
      httpOnly: true,
      sameSite: 'lax',
    });

    // The token is set as an HttpOnly cookie and deliberately NOT returned in
    // the body: a token in a JSON response invites a client to store it in
    // localStorage, where any XSS can read it.
    return { userId: result.userId, expiresAt: result.session.expiresAt };
  },
});
