/**
 * TL-API-AUTH-VERIFY-RESEND-001 — POST /api/v1/auth/verify/resend
 *
 * Send a fresh email verification link. The previous link stops working.
 *
 * Returns the real delivery outcome. With no email provider configured,
 * `sent` is false with reason NOT_CONFIGURED — the UI must say verification
 * email is unavailable, not "check your inbox" (Constitution P10).
 */

import { sendEmailVerification } from '@/platform/auth/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AUTH-VERIFY-RESEND-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  // Each call can send an email, which costs money and can harass an inbox.
  rateLimit: 'costly',
  audit: true,
  handler: async ({ principal, ipAddress, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return sendEmailVerification(principal.userId, { ipAddress, requestId });
  },
});
