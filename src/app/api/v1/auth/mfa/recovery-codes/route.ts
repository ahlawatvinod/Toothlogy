/**
 * TL-API-AUTH-MFA-RECOVERY-001 — POST /api/v1/auth/mfa/recovery-codes
 *
 * Replace the recovery codes with a fresh batch. The old codes stop working
 * the moment this succeeds, which is the point: a user who suspects their
 * printed codes were seen needs a way to void them.
 */

import { z } from 'zod';
import { regenerateRecoveryCodes } from '@/platform/auth/mfa';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AUTH-MFA-RECOVERY-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema: z.object({ password: z.string().min(1, 'Enter your password.') }),
  audit: true,
  handler: async ({ principal, body, ipAddress, userAgent, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return regenerateRecoveryCodes(principal.userId, body.password, {
      ipAddress,
      userAgent,
      requestId,
    });
  },
});
