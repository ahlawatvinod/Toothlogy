/**
 * TL-PAGE-ACCOUNT-NOTIFICATIONS-001 — /account/notifications
 *
 * The notification centre and the controls for it, on one page: a user who
 * is getting too many of something is looking at those notifications when
 * they decide to turn them off.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { encodeCursor } from '@/platform/http/query';
import { getNotificationPreferences } from '@/platform/users/preferences';
import { NotificationsClient } from './notifications-client';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PAGE = 30;

export default async function NotificationsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/notifications');

  const [rows, unread, matrix, user] = await Promise.all([
    db().inAppNotification.findMany({
      where: { userId: principal.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE + 1,
    }),
    db().inAppNotification.count({ where: { userId: principal.userId, readAt: null } }),
    getNotificationPreferences(principal.userId),
    db().user.findUnique({ where: { id: principal.userId }, select: { timezone: true, locale: true } }),
  ]);

  const items = rows.slice(0, PAGE);
  const last = items[items.length - 1];

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Notifications</h1>
        <p className="tl-page__lead">Everything Toothlogy has told you, and how you want to hear it.</p>
      </header>
      <NotificationsClient
        initial={items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          linkUrl: n.linkUrl,
          readAt: n.readAt?.toISOString() ?? null,
          createdAt: n.createdAt.toISOString(),
        }))}
        initialCursor={rows.length > PAGE && last ? encodeCursor(`${last.createdAt.toISOString()}|${last.id}`) : null}
        unread={unread}
        matrix={matrix}
        timezone={user?.timezone ?? 'Asia/Kolkata'}
        locale={user?.locale ?? 'en'}
      />
    </div>
  );
}
