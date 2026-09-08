/**
 * TL-API-AUTH-CHANGEPW-001 — POST /api/v1/auth/password/change
 *
 * Changes the password of the signed-in user.
 *
 * Requires the current password even though the caller is authenticated. That
 * check is what stops an unattended logged-in device from becoming a permanent
 * account takeover: without it, anyone who finds an open laptop owns the
 * account forever.
 */

import { z } from 'zod';
import { changePassword } from '@/platform/auth/service';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/platform/auth/password';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(MAX_PASSWORD_LENGTH),
});

export const POST = defineRoute({
  id: 'TL-API-AUTH-CHANGEPW-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await changePassword(
      principal.userId,
      body.currentPassword,
      body.newPassword,
      // The current session is kept so the user is not ejected from the page
      // they just used; every other device is signed out.
      { keepSessionId: principal.sessionId, requestId },
    );

    return { passwordChanged: true, otherSessionsRevoked: result.sessionsRevoked };
  },
});
