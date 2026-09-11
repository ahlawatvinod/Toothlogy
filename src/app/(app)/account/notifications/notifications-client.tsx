'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { api } from '@/lib/api-client';

interface Item {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface MatrixRow {
  category: string;
  notificationCount: number;
  channels: Array<{ channel: string; used: boolean; enabled: boolean; locked: boolean }>;
}

const CATEGORY_LABEL: Record<string, string> = {
  account: 'Account',
  security: 'Security',
  appointments: 'Appointments',
  messages: 'Messages',
  reviews: 'Reviews',
  leads: 'Patient requests',
  billing: 'Billing',
  marketplace: 'Marketplace',
  careers: 'Careers',
  community: 'Community',
  marketing: 'News and offers',
};

const CHANNEL_LABEL: Record<string, string> = {
  in_app: 'In Toothlogy',
  push: 'Push',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

export function NotificationsClient({
  initial,
  initialCursor,
  unread,
  matrix,
  timezone,
  locale,
}: {
  initial: Item[];
  initialCursor: string | null;
  unread: number;
  matrix: MatrixRow[];
  timezone: string;
  locale: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; requestId: string } | null>(null);
  const [prefs, setPrefs] = useState(matrix);

  const format = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));

  const markAll = async () => {
    const r = await api.post('/api/v1/notifications', { all: true });
    if (r.ok) {
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      startTransition(() => router.refresh());
    } else setError({ message: r.message, requestId: r.requestId });
  };

  const open = async (item: Item) => {
    if (!item.readAt) {
      void api.post('/api/v1/notifications', { ids: [item.id] });
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)));
    }
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    const r = await api.get<{ items: Item[]; pageInfo: { nextCursor: string | null } }>(
      `/api/v1/notifications?cursor=${encodeURIComponent(cursor)}&limit=30`,
    );
    setLoading(false);
    if (r.ok) {
      setItems((prev) => [...prev, ...r.data.items]);
      setCursor(r.data.pageInfo.nextCursor);
    } else setError({ message: r.message, requestId: r.requestId });
  };

  const toggle = async (category: string, channel: string, enabled: boolean) => {
    const r = await api.put<{ categories: MatrixRow[] }>('/api/v1/me/notification-preferences', { category, channel, enabled });
    if (r.ok) setPrefs(r.data.categories);
    else setError({ message: r.message, requestId: r.requestId });
  };

  const usedChannels = ['in_app', 'email', 'sms', 'push', 'whatsapp'].filter((ch) =>
    prefs.some((row) => row.channels.some((c) => c.channel === ch && c.used)),
  );

  return (
    <div className="tl-account-stack">
      {error ? (
        <Alert tone="danger" title="Something went wrong">
          {error.message} {error.requestId ? <span className="tl-form__reference">Reference: {error.requestId}</span> : null}
        </Alert>
      ) : null}

      <Card label="Your notifications">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>
              Inbox {unread > 0 ? <Badge tone="brand">{unread} unread</Badge> : null}
            </strong>
            {items.some((n) => !n.readAt) ? (
              <Button variant="ghost" size="sm" onClick={markAll}>
                Mark all as read
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <EmptyState
              title="No notifications yet"
              description="Booking confirmations, reminders, messages and security alerts will appear here."
            />
          ) : (
            <ul className="tl-list" aria-live="polite">
              {items.map((n) => {
                const content = (
                  <>
                    <strong>{n.title}</strong>
                    <span className="tl-list__meta">{n.body}</span>
                    <time dateTime={n.createdAt}>{format(n.createdAt)}</time>
                  </>
                );
                return (
                  <li key={n.id} className={n.readAt ? '' : 'tl-list__item--unread'}>
                    {n.linkUrl && n.linkUrl.startsWith('/') ? (
                      <Link className="tl-notification" href={n.linkUrl} onClick={() => void open(n)}>
                        {content}
                        {!n.readAt ? <span className="tl-visually-hidden">(unread)</span> : null}
                      </Link>
                    ) : (
                      <div className="tl-notification" onFocus={() => void open(n)}>
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {cursor ? (
            <div style={{ marginBlockStart: 'var(--tl-space-4)' }}>
              <Button variant="secondary" loading={loading} onClick={loadMore}>
                Show older notifications
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card label="How you are notified">
        <CardHeader>
          <strong>How you are notified</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ marginBlockStart: 0 }}>
            Categories marked “always on” contain only messages about things you asked for — a booking you made,
            your account’s security — so they cannot be turned off.
          </p>
          <Table caption="Notification channels by category">
            <thead>
              <tr>
                <th scope="col">Category</th>
                {usedChannels.map((ch) => (
                  <th scope="col" key={ch}>
                    {CHANNEL_LABEL[ch]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prefs
                .filter((row) => row.notificationCount > 0)
                .map((row) => (
                  <tr key={row.category}>
                    <th scope="row">{CATEGORY_LABEL[row.category] ?? row.category}</th>
                    {usedChannels.map((ch) => {
                      const cell = row.channels.find((c) => c.channel === ch)!;
                      if (!cell.used) return <td key={ch} aria-label="Not used">—</td>;
                      if (cell.locked) {
                        return (
                          <td key={ch}>
                            <span className="tl-muted">Always on</span>
                          </td>
                        );
                      }
                      return (
                        <td key={ch}>
                          <input
                            type="checkbox"
                            checked={cell.enabled}
                            aria-label={`${CATEGORY_LABEL[row.category] ?? row.category} by ${CHANNEL_LABEL[ch]}`}
                            onChange={(e) => void toggle(row.category, ch, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
