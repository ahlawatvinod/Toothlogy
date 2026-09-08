/**
 * TL-API-AUTH-SESSIONS-001 — GET  /api/v1/auth/sessions
 * TL-API-AUTH-REVOKE-001   — POST /api/v1/auth/sessions/revoke
 *
 * Lists and revokes the caller's own sessions.
 *
 * This pair is how a user detects and ends an account takeover: an unfamiliar
 * device or location in the list, then revoke. The list alone would be an alarm
 * with no off switch, which is why both live in one file and ship together.
 *
 * Scoped to the caller's OWN sessions in every case. A user id is never taken
 * from the request — reading it from the body would make this an IDOR that lets
 * anyone enumerate and terminate anyone else's sessions.
 */

import { z } from 'zod';
import { listSessions, revokeAllSessions, revokeSession } from '@/platform/auth/session';
import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-AUTH-SESSIONS-001',
  permissions: ['tl.core.session.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const sessions = await listSessions(principal.userId, principal.sessionId);
    return { sessions };
  },
});

const revokeSchema = z.object({
  /** Omit with `allOthers` to end every other session. */
  sessionId: z.string().min(1).optional(),
  allOthers: z.boolean().default(false),
});

export const POST = defineRoute({
  id: 'TL-API-AUTH-REVOKE-001',
  permissions: ['tl.core.session.revoke.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: revokeSchema,
  audit: true,
  handler: async ({ principal, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    if (body.allOthers) {
      const count = await revokeAllSessions(principal.userId, {
        exceptSessionId: principal.sessionId,
      });
      return { revoked: count };
    }

    if (!body.sessionId) {
      throw errors.validation('Provide a sessionId, or set allOthers to true.');
    }

    /*
     * Ownership check before revoking.
     *
     * Without it, any authenticated user could pass someone else's session ID
     * and sign them out — a denial-of-service against an arbitrary account, and
     * a textbook IDOR. `findFirst` scoped to the caller's own userId means a
     * session belonging to anyone else is simply not found.
     */
    const owned = await db().session.findFirst({
      where: { id: body.sessionId, userId: principal.userId },
      select: { id: true },
    });

    if (!owned) throw errors.notFound('Session');

    await revokeSession(owned.id);
    return { revoked: 1 };
  },
});
