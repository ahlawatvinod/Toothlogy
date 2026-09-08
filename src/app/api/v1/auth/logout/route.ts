/**
 * TL-API-AUTH-LOGOUT-001 — POST /api/v1/auth/logout
 *
 * Revokes the session server-side AND clears the cookie. Both are required:
 * clearing only the cookie leaves a valid token that anyone who captured it can
 * still use, and revoking only server-side leaves the browser sending a dead
 * cookie on every request.
 */

import { z } from 'zod';
import { SESSION_COOKIE, revokeAllSessions, revokeSession } from '@/platform/auth/session';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** Sign out on every device — used after a suspected compromise. */
  allDevices: z.boolean().default(false),
});

export const POST = defineRoute({
  id: 'TL-API-AUTH-LOGOUT-001',
  permissions: [],
  // Deliberately not authRequired: logging out with an already-expired session
  // must still clear the cookie rather than return 401 and leave the browser
  // stuck in a signed-in-looking state.
  authRequired: false,
  rateLimit: 'authenticated-standard',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, clearCookie }) => {
    let revokedCount = 0;

    if (isAuthenticated(principal)) {
      if (body.allDevices) {
        revokedCount = await revokeAllSessions(principal.userId);
      } else {
        await revokeSession(principal.sessionId);
        revokedCount = 1;
      }
    }

    clearCookie(SESSION_COOKIE);

    return { signedOut: true, sessionsRevoked: revokedCount };
  },
});
