/**
 * TL-API-ME-DELETE-001 — POST /api/v1/me/deletion  { password, confirm: "DELETE", reason? }
 *
 * Schedule deletion of the caller's account after a 30-day grace period.
 *
 * Needs the password as well as the session: a session left open on a shared
 * computer must not be enough to delete someone's account and their dental
 * history. Every session ends immediately, including this one — the cookie is
 * cleared in the same response — and the owner can restore the account by
 * signing in before the date.
 */

import { z } from 'zod';
import { requestAccountDeletion } from '@/platform/auth/service';
import { verifyPassword } from '@/platform/auth/password';
import { SESSION_COOKIE } from '@/platform/auth/session';
import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ME-DELETE-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema: z.object({
    password: z.string().min(1, 'Enter your password.'),
    confirm: z.literal('DELETE', { message: 'Type DELETE to confirm.' }),
    reason: z.string().trim().max(1000).optional(),
  }),
  audit: true,
  handler: async ({ principal, body, requestId, clearCookie }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const credential = await db().credential.findFirst({
      where: { userId: principal.userId, type: 'PASSWORD' },
    });
    if (!credential || !(await verifyPassword(body.password, credential.secretHash))) {
      throw errors.validation('Your password is incorrect.', { field: 'password' });
    }

    const { scheduledFor } = await requestAccountDeletion(principal.userId, body.reason, { requestId });
    clearCookie(SESSION_COOKIE);

    return {
      scheduledFor,
      message:
        'Your account is scheduled for deletion and you have been signed out everywhere. Sign in before the date to restore it.',
    };
  },
});
