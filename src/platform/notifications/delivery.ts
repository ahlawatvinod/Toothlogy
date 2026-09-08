/**
 * TOOTHLOGY NOTIFICATION DELIVERY
 *
 * Persists every send attempt and implements in-app delivery.
 *
 * WHY EVERY ATTEMPT IS RECORDED
 * "Why didn't the patient get the reminder?" has to be answerable. Without a
 * delivery trail, a failed SMS is invisible: the appointment is missed, the
 * clinic blames the patient, the patient blames the clinic, and nobody can
 * check. A `NotificationRecord` per channel per recipient makes the answer a
 * query.
 *
 * WHY RETRY IS SCHEDULED RATHER THAN LOOPED
 * Retrying in-process would hold the request open while a provider times out —
 * turning someone else's outage into our latency. Failed sends get a
 * `nextAttemptAt` and are picked up by the retry worker, so the user's request
 * returns immediately and delivery keeps trying in the background.
 */

import type { NotificationChannel } from '@/registry/types';
import { NOTIFICATION_BY_ID } from '@/registry/events';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { logger } from '../observability/logger';
import type { ChannelOutcome } from './index';

/** Maps our channel vocabulary to the database enum. */
const CHANNEL_TO_DB = {
  in_app: 'IN_APP',
  push: 'PUSH',
  email: 'EMAIL',
  sms: 'SMS',
  whatsapp: 'WHATSAPP',
} as const;

/**
 * Backoff schedule in minutes: 1, 5, 30, 120, 480.
 *
 * Exponential rather than fixed, because the usual causes of failure are
 * transient (a provider blip) or long (a misconfigured key). Retrying every
 * minute forever converts the second case into sustained load against a
 * provider that is never going to accept the message.
 */
const RETRY_SCHEDULE_MINUTES = [1, 5, 30, 120, 480];
export const MAX_DELIVERY_ATTEMPTS = RETRY_SCHEDULE_MINUTES.length;

export function nextAttemptAt(attempts: number): Date | null {
  const minutes = RETRY_SCHEDULE_MINUTES[attempts];
  if (minutes === undefined) return null; // Exhausted — no further retry.
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Record the outcome of one channel's delivery attempt.
 *
 * Never throws. A failure to write the delivery record must not fail the
 * notification, and must certainly not fail the appointment that triggered it.
 */
export async function recordDelivery(params: {
  readonly notificationId: string;
  readonly userId: string;
  readonly channel: NotificationChannel;
  readonly outcome: ChannelOutcome;
  readonly data?: Readonly<Record<string, string | number>>;
}): Promise<void> {
  const { notificationId, userId, channel, outcome, data } = params;

  try {
    const now = new Date();
    const attempts = outcome.status === 'skipped' ? 0 : 1;

    await db().notificationRecord.create({
      data: {
        id: newId('request'),
        notificationId,
        userId,
        channel: CHANNEL_TO_DB[channel],
        status:
          outcome.status === 'sent'
            ? 'SENT'
            : outcome.status === 'skipped'
              ? 'SKIPPED'
              : 'FAILED',
        data: data ? (data as never) : undefined,
        attempts,
        lastError: outcome.reason ?? null,
        providerMessageId: outcome.receipt?.providerMessageId ?? null,
        sentAt: outcome.status === 'sent' ? now : null,
        failedAt: outcome.status === 'failed' ? now : null,
        // A skipped notification is never retried: no consent and no address on
        // file are not transient conditions, and retrying would be both futile
        // and, for a marketing message, a consent violation.
        nextAttemptAt: outcome.status === 'failed' ? nextAttemptAt(attempts) : null,
      },
    });
  } catch (error) {
    logger.warn('Failed to record notification delivery', {
      notificationId,
      channel,
      error,
    });
  }
}

/**
 * Deliver an in-app notification.
 *
 * In-app is the one channel with no external provider: it is a row in our own
 * database, which is why it always works and is the reliable floor beneath
 * every other channel. When email and SMS are unconfigured, the user still has
 * a record of what happened waiting for them.
 */
export async function deliverInApp(params: {
  readonly notificationId: string;
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly linkUrl?: string;
}): Promise<{ id: string }> {
  const id = newId('request');

  await db().inAppNotification.create({
    data: {
      id,
      userId: params.userId,
      notificationId: params.notificationId,
      title: params.title,
      body: params.body,
      linkUrl: params.linkUrl ?? null,
    },
  });

  return { id };
}

/** A user's in-app notifications, newest first. */
export async function listInAppNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<{
  items: Array<{
    id: string;
    notificationId: string;
    title: string;
    body: string;
    linkUrl: string | null;
    readAt: Date | null;
    createdAt: Date;
  }>;
  unreadCount: number;
}> {
  const limit = Math.min(options.limit ?? 20, 100);

  const [items, unreadCount] = await Promise.all([
    db().inAppNotification.findMany({
      where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    db().inAppNotification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: items.map((n) => ({
      id: n.id,
      notificationId: n.notificationId,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unreadCount,
  };
}

/**
 * Mark notifications read.
 *
 * Scoped to the caller's own rows by `userId` in the WHERE clause, so a
 * supplied id belonging to someone else simply matches nothing. `updateMany`
 * rather than `update` for exactly that reason — `update` by id alone would
 * mark another user's notification read.
 */
export async function markNotificationsRead(
  userId: string,
  ids: readonly string[] | 'all',
): Promise<number> {
  const result = await db().inAppNotification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids === 'all' ? {} : { id: { in: [...ids] } }),
    },
    data: { readAt: new Date() },
  });
  return result.count;
}

/**
 * Notifications awaiting retry.
 *
 * Consumed by the retry worker. Ordered oldest first so a backlog drains in the
 * order it accumulated rather than starving the oldest messages.
 */
export async function dueForRetry(limit = 50): Promise<
  Array<{
    id: string;
    notificationId: string;
    userId: string;
    channel: string;
    attempts: number;
    data: unknown;
  }>
> {
  const rows = await db().notificationRecord.findMany({
    where: {
      status: 'FAILED',
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: MAX_DELIVERY_ATTEMPTS },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    notificationId: r.notificationId,
    userId: r.userId,
    channel: r.channel,
    attempts: r.attempts,
    data: r.data,
  }));
}

/** Render a notification's title and body for the in-app channel. */
export async function renderInApp(
  notificationId: string,
  locale: string,
  data: Readonly<Record<string, string | number>> = {},
): Promise<{ title: string; body: string } | null> {
  const template = await db().notificationTemplate.findFirst({
    where: { notificationId, channel: 'IN_APP', locale, isActive: true },
  });

  // Fall back to the default locale before giving up: an untranslated
  // notification in English beats no notification at all.
  const fallback =
    template ??
    (await db().notificationTemplate.findFirst({
      where: { notificationId, channel: 'IN_APP', locale: 'en', isActive: true },
    }));

  if (!fallback) {
    // No template: use the registry description so the user still learns that
    // something happened, rather than receiving nothing.
    const definition = NOTIFICATION_BY_ID.get(notificationId);
    if (!definition) return null;
    return { title: definition.name, body: definition.description };
  }

  return {
    title: interpolate(fallback.subject ?? '', data),
    body: interpolate(fallback.body, data),
  };
}

function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}
