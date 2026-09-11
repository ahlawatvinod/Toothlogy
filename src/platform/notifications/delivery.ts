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
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { logger } from '../observability/logger';
import type { ChannelOutcome } from './index';

/** Maps our channel vocabulary to the database enum. */
export const CHANNEL_TO_DB = {
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
  /** The message carried a single-use secret that was not stored. */
  readonly transient?: boolean;
  readonly linkUrl?: string;
  readonly sourceEventId?: string;
}): Promise<void> {
  const { notificationId, userId, channel, outcome, data } = params;

  try {
    const now = new Date();
    const attempts = outcome.status === 'skipped' || outcome.status === 'deferred' ? 0 : 1;

    // The stored payload is what a retry re-renders from. The link path is
    // kept (it names a page, not a secret); transient values never are.
    const stored: Record<string, unknown> = { ...(data ?? {}) };
    if (params.linkUrl) stored.__linkUrl = params.linkUrl;
    if (params.transient) stored.__transient = true;

    const status =
      outcome.status === 'sent'
        ? outcome.receipt?.status === 'delivered'
          ? 'DELIVERED'
          : 'SENT'
        : outcome.status === 'skipped'
          ? 'SKIPPED'
          : outcome.status === 'deferred'
            ? 'PENDING'
            : 'FAILED';

    await db().notificationRecord.create({
      data: {
        id: newId('notification'),
        notificationId,
        userId,
        channel: CHANNEL_TO_DB[channel],
        status,
        data: Object.keys(stored).length > 0 ? (stored as never) : undefined,
        attempts,
        lastError: outcome.status === 'deferred' ? null : (outcome.reason ?? null),
        sourceEventId: params.sourceEventId ?? null,
        providerMessageId: outcome.receipt?.providerMessageId ?? null,
        sentAt: outcome.status === 'sent' ? now : null,
        deliveredAt: status === 'DELIVERED' ? now : null,
        failedAt: outcome.status === 'failed' ? now : null,
        // A skipped notification is never retried: no consent and no address on
        // file are not transient conditions, and retrying would be both futile
        // and, for a marketing message, a consent violation. A deferred one is
        // scheduled for the end of quiet hours.
        nextAttemptAt:
          outcome.status === 'failed'
            ? params.transient
              ? null
              : nextAttemptAt(attempts)
            : outcome.status === 'deferred'
              ? (outcome.deferredUntil ?? null)
              : null,
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
  const id = newId('notification');

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

// Rendering lives in ./templates.ts — one renderer for every channel.
