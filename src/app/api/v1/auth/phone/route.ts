/**
 * TL-API-AUTH-PHONE-001 — POST /api/v1/auth/phone
 *
 * Verify a phone number with a one-time SMS code: `request` sends one,
 * `confirm` checks it. The number becomes the account's verified number only
 * on a correct code, so a typo never replaces a working number.
 *
 * With no SMS provider configured, `request` returns `sent: false` with reason
 * NOT_CONFIGURED. The code is never returned to the client as a fallback: a
 * code the browser can read proves nothing about owning the phone.
 */

import { z } from 'zod';
import {
  confirmPhoneVerification,
  phoneSchema,
  requestPhoneVerification,
} from '@/platform/auth/service';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), phone: phoneSchema.optional() }),
  z.object({
    action: z.literal('confirm'),
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  }),
]);

export const POST = defineRoute({
  id: 'TL-API-AUTH-PHONE-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'costly',
  bodySchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    if (body.action === 'request') {
      return requestPhoneVerification(principal.userId, body.phone, { requestId });
    }
    const result = await confirmPhoneVerification(principal.userId, body.code, { requestId });
    return { verified: true, phone: result.phone };
  },
});
