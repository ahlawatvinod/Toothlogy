/**
 * TL-API-AUTH-RESETREQ-001 — POST /api/v1/auth/password/reset-request
 *
 * Begins a password reset.
 *
 * **Always responds identically**, whether or not the address is registered.
 * A response that differed — a 404, a different message, even a measurably
 * different latency — would turn this endpoint into an account-enumeration
 * oracle. For a dental platform, confirming that a named person has an account
 * is health-adjacent information about a real individual.
 *
 * On `costly` rate limiting (10/hour): each call can dispatch an email, which
 * costs money and, uncapped, makes this a free mail-bombing service pointed at
 * any address an attacker chooses.
 */

import { z } from 'zod';
import { emailSchema, requestPasswordReset } from '@/platform/auth/service';
import { getPublicConfig } from '@/platform/config';
import { defineRoute } from '@/platform/http/handler';
import { sendNotification } from '@/platform/notifications';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ email: emailSchema });

export const POST = defineRoute({
  id: 'TL-API-AUTH-RESETREQ-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'costly',
  bodySchema,
  audit: true,
  handler: async ({ body, ipAddress, requestId, logger }) => {
    const result = await requestPasswordReset(body.email, { ipAddress, requestId });

    if (result.token && result.userId && result.destination) {
      const outcome = await sendNotification({
        notificationId: 'TL-NOTIF-WELCOME-001',
        recipient: {
          userId: result.userId,
          email: result.destination,
          locale: 'en',
          timezone: 'Asia/Kolkata',
        },
        data: {
          resetUrl: `${getPublicConfig().NEXT_PUBLIC_APP_URL}/reset-password?token=${result.token}`,
        },
        requestId,
      });

      if (!outcome.anyDelivered) {
        // Logged, never returned. Telling the caller that delivery failed for
        // this address confirms the address exists.
        logger.warn('Password reset email could not be delivered', {
          userId: result.userId,
          outcomes: outcome.outcomes.map((o) => `${o.channel}:${o.status}`),
        });
      }
    }

    // The same body in every case, by construction.
    return {
      message:
        'If an account exists for that email address, a password reset link has been sent.',
    };
  },
});
