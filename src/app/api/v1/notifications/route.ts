/**
 * TL-API-NOTIF-LIST-001 — GET  /api/v1/notifications?unread=1&cursor=…
 * TL-API-NOTIF-READ-001 — POST /api/v1/notifications  { ids } | { all: true }
 *
 * The notification centre. Both operations are scoped to the caller's own
 * rows in the query itself, so another user's notification id simply matches
 * nothing.
 */

import { z } from 'zod';
import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { decodeCursor, paginate, paginationSchema } from '@/platform/http/query';
import { errors } from '@/platform/kernel/errors';
import { markNotificationsRead } from '@/platform/notifications/delivery';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-NOTIF-LIST-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, url }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const page = paginationSchema.safeParse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!page.success) throw errors.validation('Invalid pagination parameters.');
    const unreadOnly = url.searchParams.get('unread') === '1';

    // Cursor is "<createdAt ISO>|<id>": keyset pagination on (createdAt, id),
    // stable while new notifications keep arriving at the top.
    let after: { createdAt: Date; id: string } | null = null;
    if (page.data.cursor) {
      const [iso, id] = decodeCursor(page.data.cursor).split('|');
      if (!iso || !id || Number.isNaN(Date.parse(iso))) throw errors.validation('Invalid pagination cursor.');
      after = { createdAt: new Date(iso), id };
    }

    const rows = await db().inAppNotification.findMany({
      where: {
        userId: principal.userId,
        ...(unreadOnly ? { readAt: null } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: page.data.limit + 1,
    });

    const unreadCount = await db().inAppNotification.count({
      where: { userId: principal.userId, readAt: null },
    });

    const result = paginate(rows, page.data.limit, (n) => `${n.createdAt.toISOString()}|${n.id}`);
    return {
      unreadCount,
      items: result.items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        linkUrl: n.linkUrl,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      pageInfo: result.pageInfo,
    };
  },
});

export const POST = defineRoute({
  id: 'TL-API-NOTIF-READ-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: z.union([
    z.object({ ids: z.array(z.string().max(64)).min(1).max(100) }),
    z.object({ all: z.literal(true) }),
  ]),
  audit: false,
  handler: async ({ principal, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const marked = await markNotificationsRead(principal.userId, 'all' in body ? 'all' : body.ids);
    return { marked };
  },
});
