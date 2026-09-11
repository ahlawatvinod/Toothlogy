/**
 * TL-API-NOTIF-UNSUB-001 — GET /api/v1/notifications/unsubscribe?u=&c=&ch=&s=
 *
 * One-click unsubscribe from a marketing or community email/SMS, as required
 * of bulk senders. `permissions: []` because the HMAC-signed link is the
 * authorization: it names one user, one category and one channel, and cannot
 * be altered to name another. Transactional categories cannot be turned off by
 * link — only in settings, where the consequences are explained.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { unsubscribeFromLink } from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-NOTIF-UNSUB-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ url }) => {
    const p = Object.fromEntries(url.searchParams) as Record<string, string | undefined>;
    if (!p.u || !p.c || !p.ch || !p.s) throw errors.validation('This unsubscribe link is incomplete.');
    const result = await unsubscribeFromLink({ u: p.u, c: p.c, ch: p.ch, s: p.s });
    return {
      unsubscribed: true,
      ...result,
      message: 'You will no longer receive these messages on this channel. You can change this in your settings.',
    };
  },
});
