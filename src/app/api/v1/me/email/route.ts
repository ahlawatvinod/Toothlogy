/**
 * TL-API-ME-EMAIL-001 — POST /api/v1/me/email  { newEmail, password }
 *
 * Start an email change. Needs the current password; the new address takes
 * effect only when the link sent to it is opened. Returns the real delivery
 * outcome — NOT_CONFIGURED while no email provider is set up.
 */

import { z } from 'zod';
import { requestEmailChange } from '@/platform/auth/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ME-EMAIL-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema: z.object({
    newEmail: z.string().trim().min(3).max(320),
    password: z.string().min(1, 'Enter your password.'),
  }),
  audit: true,
  handler: async ({ principal, body, ipAddress, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return requestEmailChange(principal.userId, body.newEmail, body.password, { ipAddress, requestId });
  },
});
