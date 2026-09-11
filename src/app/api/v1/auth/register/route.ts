/**
 * TL-API-AUTH-REGISTER-001 — POST /api/v1/auth/register
 *
 * Creates an account, signs the user in, and sends a verification message to
 * whichever contact method was given — an email link or an SMS code.
 *
 * Rate limited on `auth-strict` (5/minute per IP): registration is a write, it
 * costs an scrypt hash of CPU, and left open it is a cheap way to fill the users
 * table.
 *
 * The verification link travels as transient data and is never written to a
 * delivery record, so a database read cannot yield a working link.
 */

import {
  register,
  registerSchema,
  requestPhoneVerification,
  sendEmailVerification,
} from '@/platform/auth/service';
import { setSessionCookie } from '@/platform/auth/cookies';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-AUTH-REGISTER-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'auth-strict',
  bodySchema: registerSchema,
  audit: true,
  handler: async ({ body, ipAddress, userAgent, requestId, setCookie, logger }) => {
    const result = await register(body, { ipAddress, userAgent, requestId });

    // HttpOnly so an XSS payload cannot read the session token.
    setSessionCookie(result.session, setCookie);

    // Verification delivery. With no provider configured this reports
    // NOT_CONFIGURED and never success (Constitution P10). Registration still
    // succeeds — the account exists and the user is signed in; only the
    // verification message is undeliverable, and the client says so.
    let delivery: { sent: boolean; reason: string | null } = { sent: false, reason: null };
    let channel: 'email' | 'sms' | null = null;

    if (body.email) {
      channel = 'email';
      delivery = await sendEmailVerification(result.userId, { ipAddress, requestId });
    } else if (body.phone) {
      channel = 'sms';
      delivery = await requestPhoneVerification(result.userId, undefined, { requestId });
    }

    if (channel && !delivery.sent) {
      logger.warn('Verification message could not be delivered', {
        userId: result.userId,
        channel,
        reason: delivery.reason,
      });
    }

    return {
      userId: result.userId,
      verificationRequired: channel !== null,
      verificationChannel: channel,
      /**
       * The real delivery outcome, not an assumption. When no provider is
       * configured this is `false`, and the client says "verification is
       * unavailable" rather than "check your inbox" for a message that will
       * never arrive (Constitution P10).
       */
      verificationSent: delivery.sent,
      verificationFailureReason: delivery.sent ? null : delivery.reason,
    };
  },
});
