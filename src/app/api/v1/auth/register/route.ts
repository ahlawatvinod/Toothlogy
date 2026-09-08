/**
 * TL-API-AUTH-REGISTER-001 — POST /api/v1/auth/register
 *
 * Creates an account, signs the user in, and issues a verification token.
 *
 * Rate limited on `auth-strict` (5/minute per IP): registration is a write, it
 * costs an scrypt hash of CPU, and left open it is a cheap way to fill the users
 * table.
 */

import { register, registerSchema } from '@/platform/auth/service';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from '@/platform/auth/session';
import { defineRoute } from '@/platform/http/handler';
import { sendNotification } from '@/platform/notifications';
import { getPublicConfig } from '@/platform/config';

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
    setCookie(SESSION_COOKIE, result.session.token, {
      maxAgeSeconds: SESSION_TTL_DAYS * 24 * 3600,
      httpOnly: true,
      sameSite: 'lax',
    });

    // Verification delivery. With no email adapter configured this fails with
    // NOT_CONFIGURED, which is reported per channel and never as success
    // (Constitution P10). Registration still succeeds — the account exists and
    // the user is signed in; only the verification message is undeliverable.
    let verificationSent = false;

    if (result.verificationDestination) {
      const outcome = await sendNotification({
        notificationId: 'TL-NOTIF-WELCOME-001',
        recipient: {
          userId: result.userId,
          email: result.verificationDestination.includes('@')
            ? result.verificationDestination
            : undefined,
          phone: result.verificationDestination.includes('@')
            ? undefined
            : result.verificationDestination,
          locale: body.locale ?? 'en',
          timezone: body.timezone ?? 'Asia/Kolkata',
        },
        data: {
          verifyUrl: `${getPublicConfig().NEXT_PUBLIC_APP_URL}/verify?token=${result.verificationToken}`,
        },
        requestId,
      });

      verificationSent = outcome.anyDelivered;

      if (!verificationSent) {
        logger.warn('Verification message could not be delivered', {
          userId: result.userId,
          outcomes: outcome.outcomes.map((o) => `${o.channel}:${o.status}`),
        });
      }
    }

    return {
      userId: result.userId,
      /**
       * The real delivery outcome, not an assumption. When no provider is
       * configured this is `false`, and the client says "verification is
       * unavailable" rather than "check your inbox" for a mail that will never
       * arrive (Constitution P10).
       */
      verificationSent,
      verificationRequired: Boolean(result.verificationDestination),
    };
  },
});
