/**
 * TL-API-AUTH-MFA-STATUS-001 — GET  /api/v1/auth/mfa/totp
 * TL-API-AUTH-MFA-MANAGE-001 — POST /api/v1/auth/mfa/totp
 *
 * Two-step verification with an authenticator app: status, set up, confirm,
 * turn off. One endpoint with an `action` discriminator, because these are
 * the steps of one flow on one settings panel.
 *
 * Every state change needs proof beyond the session — the password to start
 * or stop, a working code to confirm — so a stolen session cannot enrol an
 * attacker's authenticator or strip the owner's.
 */

import { z } from 'zod';
import {
  confirmTotpEnrollment,
  disableTotp,
  mfaStatus,
  startTotpEnrollment,
} from '@/platform/auth/mfa';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-AUTH-MFA-STATUS-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return mfaStatus(principal.userId);
  },
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), password: z.string().min(1, 'Enter your password.') }),
  z.object({
    action: z.literal('confirm'),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your app.'),
  }),
  z.object({
    action: z.literal('disable'),
    password: z.string().min(1, 'Enter your password.'),
    code: z.string().trim().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  }),
]);

export const POST = defineRoute({
  id: 'TL-API-AUTH-MFA-MANAGE-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'auth-strict',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, ipAddress, userAgent, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const context = { ipAddress, userAgent, requestId };

    switch (body.action) {
      case 'start': {
        const setup = await startTotpEnrollment(principal.userId, body.password);
        // The secret is shown once, to its owner, to type into their app. It is
        // stored only encrypted and is never returned again.
        return { step: 'confirm', secret: setup.secret, otpauthUri: setup.otpauthUri };
      }
      case 'confirm': {
        const { recoveryCodes } = await confirmTotpEnrollment(principal.userId, body.code, context);
        return { step: 'done', enabled: true, recoveryCodes };
      }
      case 'disable': {
        await disableTotp(
          principal.userId,
          body.password,
          { code: body.code, recoveryCode: body.recoveryCode },
          context,
        );
        return { enabled: false };
      }
    }
  },
});
