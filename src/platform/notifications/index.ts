/**
 * TOOTHLOGY NOTIFICATION SERVICE
 *
 * The layer between "something happened" and "a message was sent".
 *
 * Callers name a registered notification and a recipient; they do not choose
 * channels. That inversion is the point — if each division picked its own
 * channels, the rules that must hold platform-wide (marketing consent, quiet
 * hours, per-user preferences, per-country legality) would be reimplemented
 * inconsistently in thirty-five places, and the one that got it wrong would be
 * the compliance incident.
 *
 * Dispatch order:
 *
 *   1. resolve the notification definition from the registry
 *   2. drop channels the user muted for this category (transactional excepted)
 *   3. drop marketing channels the user has not consented to
 *   4. hold non-urgent push/SMS/WhatsApp during the user's quiet hours
 *   5. render each surviving channel from its template, and send
 *   6. persist a delivery record per channel — including failures and skips
 *
 * HONEST DELIVERY STATES
 * A record is SENT only when a provider accepted the message, DELIVERED only
 * when delivery is a fact (in-app rows, provider delivery receipts). With no
 * provider configured, email/SMS/WhatsApp/push fail with NOT_CONFIGURED and
 * are recorded as FAILED with that reason — never as sent (Constitution P10).
 *
 * SINGLE-USE SECRETS
 * Reset links and one-time codes travel in `transientData`: interpolated into
 * the message, never written to the delivery record. Such a message is not
 * retried — the secret is gone — and the user is told to request a new one.
 */

import { NOTIFICATION_BY_ID } from '@/registry/events';
import type { NotificationCategoryKey, NotificationChannel } from '@/registry/types';
import { getPublicConfig, hasDatabase } from '../config';
import { errors, toAppError } from '../kernel/errors';
import { logger } from '../observability/logger';
import { db } from '../db/client';
import {
  CHANNEL_TO_DB,
  MAX_DELIVERY_ATTEMPTS,
  deliverInApp,
  nextAttemptAt,
  recordDelivery,
} from './delivery';
import { renderMessage, toEmailHtml, type TemplateValues } from './templates';
import {
  type DeliveryReceipt,
  emailProvider,
  pushProvider,
  smsProvider,
  whatsAppProvider,
} from './ports';

export interface QuietHours {
  /** Minutes from local midnight. */
  readonly start: number;
  readonly end: number;
}

export interface NotificationRecipient {
  readonly userId: string;
  readonly email?: string;
  /** E.164. */
  readonly phone?: string;
  readonly pushTokens?: readonly string[];
  readonly locale: string;
  readonly timezone: string;
  /** Channels the user has switched off. Ignored for transactional messages. */
  readonly mutedChannels?: readonly NotificationChannel[];
  /** Has the user consented to marketing contact? */
  readonly marketingConsent?: boolean;
  readonly quietHours?: QuietHours | null;
}

export interface NotificationRequest {
  /** Registered notification ID, e.g. `TL-NOTIF-APPOINTMENT-CONFIRMED-001`. */
  readonly notificationId: string;
  readonly recipient: NotificationRecipient;
  /** Values interpolated into the template AND stored on the delivery record. */
  readonly data?: TemplateValues;
  /** Interpolated, never stored. For single-use links and codes. */
  readonly transientData?: Readonly<Record<string, string>>;
  /** App-relative path the notification leads to, e.g. `/account/appointments/apt_…`. */
  readonly linkUrl?: string;
  readonly sourceEventId?: string;
  readonly requestId?: string;
}

export interface ChannelOutcome {
  readonly channel: NotificationChannel;
  readonly status: 'sent' | 'skipped' | 'failed' | 'deferred';
  readonly reason?: string;
  readonly receipt?: DeliveryReceipt;
  readonly deferredUntil?: Date;
}

export interface NotificationResult {
  readonly notificationId: string;
  readonly outcomes: readonly ChannelOutcome[];
  /** True when at least one channel accepted the message. */
  readonly anyDelivered: boolean;
}

/**
 * Which channels should actually be used for this recipient.
 *
 * Returns skip reasons alongside the selection, so a support question — "why
 * didn't the patient get the reminder?" — is answerable from the result rather
 * than by re-deriving the logic by hand.
 */
export function selectChannels(
  channels: readonly NotificationChannel[],
  transactional: boolean,
  recipient: NotificationRecipient,
): { selected: NotificationChannel[]; skipped: ChannelOutcome[] } {
  const selected: NotificationChannel[] = [];
  const skipped: ChannelOutcome[] = [];

  for (const channel of channels) {
    if (!transactional && recipient.marketingConsent !== true) {
      skipped.push({ channel, status: 'skipped', reason: 'No marketing consent' });
      continue;
    }
    // Transactional messages override a mute: a user who silenced notifications
    // still needs to be told their appointment was cancelled.
    if (!transactional && recipient.mutedChannels?.includes(channel)) {
      skipped.push({ channel, status: 'skipped', reason: 'Channel muted by user' });
      continue;
    }
    if (channel === 'email' && !recipient.email) {
      skipped.push({ channel, status: 'skipped', reason: 'No email address on file' });
      continue;
    }
    if ((channel === 'sms' || channel === 'whatsapp') && !recipient.phone) {
      skipped.push({ channel, status: 'skipped', reason: 'No phone number on file' });
      continue;
    }
    if (channel === 'push' && (recipient.pushTokens?.length ?? 0) === 0) {
      skipped.push({ channel, status: 'skipped', reason: 'No registered device' });
      continue;
    }
    selected.push(channel);
  }

  return { selected, skipped };
}

/**
 * The end of quiet hours if `now` falls inside them, else null.
 *
 * Evaluated on the RECIPIENT's wall clock. Quiet hours of 22:00–07:00 span
 * midnight, which is the common case and the one a naive `start <= m < end`
 * comparison gets wrong.
 */
export function quietHoursEnd(
  quiet: QuietHours | null | undefined,
  timezone: string,
  now: Date = new Date(),
): Date | null {
  if (!quiet || quiet.start === quiet.end) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const local = hour * 60 + minute;

  const inside =
    quiet.start < quiet.end
      ? local >= quiet.start && local < quiet.end
      : local >= quiet.start || local < quiet.end;
  if (!inside) return null;

  const minutesUntilEnd = (quiet.end - local + 1440) % 1440;
  return new Date(now.getTime() + minutesUntilEnd * 60 * 1000);
}

/** Channels quiet hours hold back. In-app and email do not buzz a phone at 2am. */
const INTERRUPTING_CHANNELS: ReadonlySet<NotificationChannel> = new Set(['push', 'sms', 'whatsapp']);

/**
 * Send a notification to a fully specified recipient.
 *
 * Channels are dispatched independently: SMS failing must not prevent the
 * email. A total failure returns `anyDelivered: false` rather than throwing —
 * the caller usually cannot undo the thing that triggered the notification, so
 * it needs a report, not an exception.
 */
export async function sendNotification(request: NotificationRequest): Promise<NotificationResult> {
  const definition = NOTIFICATION_BY_ID.get(request.notificationId);
  if (!definition) {
    throw errors.validation(`Unknown notification '${request.notificationId}'.`, {
      notificationId: request.notificationId,
    });
  }

  const { selected, skipped } = selectChannels(
    definition.channels,
    definition.transactional,
    request.recipient,
  );

  const deferUntil = definition.urgent
    ? null
    : quietHoursEnd(request.recipient.quietHours, request.recipient.timezone);

  const log = logger.child({ notificationId: request.notificationId, requestId: request.requestId });

  const results = await Promise.all(
    selected.map(async (channel): Promise<ChannelOutcome> => {
      if (deferUntil && INTERRUPTING_CHANNELS.has(channel)) {
        return { channel, status: 'deferred', reason: 'Quiet hours', deferredUntil: deferUntil };
      }
      try {
        const receipt = await dispatch(channel, request);
        return { channel, status: 'sent', receipt };
      } catch (error) {
        const appError = toAppError(error);
        // Logged, not thrown. A missing provider is a configuration problem to
        // fix, not a reason to fail the appointment that triggered this.
        log.warn('Notification channel failed', { channel, errorCode: appError.code });
        return { channel, status: 'failed', reason: appError.code };
      }
    }),
  );

  const outcomes = [...results, ...skipped];

  if (hasDatabase()) {
    await Promise.all(
      outcomes.map((outcome) =>
        recordDelivery({
          notificationId: request.notificationId,
          userId: request.recipient.userId,
          channel: outcome.channel,
          outcome,
          data: request.data,
          transient: Boolean(request.transientData),
          linkUrl: request.linkUrl,
          sourceEventId: request.sourceEventId,
        }),
      ),
    );
  }

  return {
    notificationId: request.notificationId,
    outcomes,
    anyDelivered: outcomes.some((o) => o.status === 'sent'),
  };
}

/** Absolute URL for a link inside an email or SMS. */
export function absoluteUrl(path: string): string {
  const base = getPublicConfig().NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return path.startsWith('http') ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Route one channel to its provider, rendering its template first. */
async function dispatch(
  channel: NotificationChannel,
  request: NotificationRequest,
): Promise<DeliveryReceipt> {
  const { recipient, notificationId } = request;
  const values = { ...(request.data ?? {}), ...(request.transientData ?? {}) };
  const message = await renderMessage(notificationId, channel, recipient.locale, values);
  const link = request.linkUrl ? absoluteUrl(request.linkUrl) : undefined;

  switch (channel) {
    case 'email':
      return emailProvider.get().send({
        to: recipient.email!,
        subject: message.subject,
        textBody: link ? `${message.body}\n\n${link}` : message.body,
        htmlBody: toEmailHtml(message.body, link ? { href: link, label: 'Open Toothlogy' } : undefined),
      });

    case 'sms':
      return smsProvider.get().send({
        to: recipient.phone!,
        body: link ? `${message.body} ${link}` : message.body,
        templateId: message.providerTemplateId ?? undefined,
      });

    case 'whatsapp':
      return whatsAppProvider.get().send({
        to: recipient.phone!,
        // WhatsApp outside the 24-hour window requires a pre-approved template;
        // without one configured, the adapter must refuse rather than improvise.
        templateName: message.providerTemplateId ?? notificationId,
        languageCode: recipient.locale,
        parameters: message.parameters,
      });

    case 'push':
      return pushProvider.get().send({
        tokens: recipient.pushTokens ?? [],
        title: message.subject,
        body: message.body,
        data: request.linkUrl ? { url: request.linkUrl } : undefined,
      });

    case 'in_app': {
      /*
       * In-app is the one channel with no external provider: it is a row in our
       * own database. That makes it the reliable floor beneath every other
       * channel — when email and SMS are unconfigured, the user still finds a
       * record of what happened waiting for them.
       */
      if (!hasDatabase()) throw errors.notConfigured('database');

      const created = await deliverInApp({
        notificationId,
        userId: recipient.userId,
        title: message.subject,
        body: message.body,
        linkUrl: request.linkUrl,
      });

      return {
        providerMessageId: created.id,
        channel: 'in_app',
        acceptedAt: new Date(),
        // 'delivered', not 'accepted': the row exists in our database, so
        // delivery is a fact rather than a provider's promise.
        status: 'delivered',
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

const CONSENT_FOR_CHANNEL: Partial<Record<NotificationChannel, string>> = {
  email: 'MARKETING_EMAIL',
  sms: 'MARKETING_SMS',
  whatsapp: 'MARKETING_WHATSAPP',
};

/**
 * Build a recipient from the database: contact details, per-category mutes,
 * consents and quiet hours. Returns null for an account that must not be
 * contacted — erased, deleted or suspended.
 */
export async function loadRecipient(
  userId: string,
  category: NotificationCategoryKey,
  transactional: boolean,
): Promise<NotificationRecipient | null> {
  const user = await db().user.findUnique({
    where: { id: userId },
    include: {
      notificationPreferences: true,
      preference: true,
      consents: { where: { revokedAt: null } },
    },
  });

  if (!user || user.deletedAt || user.erasedAt || user.status === 'SUSPENDED') return null;

  const categoryKey = category.toUpperCase();
  const muted: NotificationChannel[] = [];
  for (const [channel, dbChannel] of Object.entries(CHANNEL_TO_DB) as Array<
    [NotificationChannel, string]
  >) {
    const specific = user.notificationPreferences.find(
      (p) => p.channel === dbChannel && p.category === categoryKey,
    );
    const channelWide = user.notificationPreferences.find(
      (p) => p.channel === dbChannel && p.category === 'ALL',
    );
    const enabled = specific?.enabled ?? channelWide?.enabled ?? true;
    if (!enabled) muted.push(channel);

    // Marketing needs channel-specific consent, not merely an unmuted channel.
    const consentPurpose = CONSENT_FOR_CHANNEL[channel];
    if (!transactional && consentPurpose && !user.consents.some((c) => c.purpose === consentPurpose)) {
      if (!muted.includes(channel)) muted.push(channel);
    }
  }

  const quiet =
    user.preference?.quietHoursStart !== null &&
    user.preference?.quietHoursStart !== undefined &&
    user.preference.quietHoursEnd !== null
      ? { start: user.preference.quietHoursStart, end: user.preference.quietHoursEnd }
      : null;

  return {
    userId: user.id,
    // Only verified contact details receive messages: an unverified address
    // may belong to someone else entirely, and a reminder sent there leaks
    // that the account holder has a dental appointment. The one exception is
    // the verification message itself, which the caller sends directly.
    email: user.email && user.emailVerifiedAt ? user.email : undefined,
    phone: user.phone && user.phoneVerifiedAt ? user.phone : undefined,
    pushTokens: [],
    locale: user.locale ?? 'en',
    timezone: user.timezone ?? 'Asia/Kolkata',
    mutedChannels: muted,
    marketingConsent: user.consents.some((c) => c.purpose.startsWith('MARKETING_')),
    quietHours: quiet,
  };
}

/**
 * Notify one user by id — the call every division makes.
 *
 * An account that cannot be contacted yields an empty result rather than an
 * error: the triggering action (an appointment cancelled by the clinic, say)
 * is still valid even if the patient's account has since been erased.
 */
export async function notifyUser(params: {
  readonly userId: string;
  readonly notificationId: string;
  readonly data?: TemplateValues;
  readonly transientData?: Readonly<Record<string, string>>;
  readonly linkUrl?: string;
  readonly sourceEventId?: string;
  readonly requestId?: string;
  /** Deliver to an address that is not yet verified — only for verifying it. */
  readonly overrideContact?: { email?: string; phone?: string };
}): Promise<NotificationResult> {
  const definition = NOTIFICATION_BY_ID.get(params.notificationId);
  if (!definition) throw errors.validation(`Unknown notification '${params.notificationId}'.`);

  const recipient = await loadRecipient(params.userId, definition.category, definition.transactional);
  if (!recipient) {
    return { notificationId: params.notificationId, outcomes: [], anyDelivered: false };
  }

  return sendNotification({
    notificationId: params.notificationId,
    recipient: params.overrideContact ? { ...recipient, ...params.overrideContact } : recipient,
    data: params.data,
    transientData: params.transientData,
    linkUrl: params.linkUrl,
    sourceEventId: params.sourceEventId,
    requestId: params.requestId,
  });
}

/**
 * Send to an address that belongs to no account — an invitation to someone
 * who has not registered yet. Only email and SMS apply, and no delivery record
 * is written, because a record must reference a user and there is none.
 */
export async function sendToAddress(params: {
  readonly notificationId: string;
  readonly email?: string;
  readonly phone?: string;
  readonly locale?: string;
  readonly data?: TemplateValues;
  readonly transientData?: Readonly<Record<string, string>>;
  readonly linkUrl?: string;
}): Promise<NotificationResult> {
  const definition = NOTIFICATION_BY_ID.get(params.notificationId);
  if (!definition) throw errors.validation(`Unknown notification '${params.notificationId}'.`);

  const recipient: NotificationRecipient = {
    userId: 'external',
    email: params.email,
    phone: params.phone,
    locale: params.locale ?? 'en',
    timezone: 'UTC',
  };
  const channels = definition.channels.filter((c) => c === 'email' || c === 'sms');
  const { selected, skipped } = selectChannels(channels, definition.transactional, recipient);

  const results = await Promise.all(
    selected.map(async (channel): Promise<ChannelOutcome> => {
      try {
        return {
          channel,
          status: 'sent',
          receipt: await dispatch(channel, { ...params, recipient }),
        };
      } catch (error) {
        return { channel, status: 'failed', reason: toAppError(error).code };
      }
    }),
  );

  const outcomes = [...results, ...skipped];
  return {
    notificationId: params.notificationId,
    outcomes,
    anyDelivered: outcomes.some((o) => o.status === 'sent'),
  };
}

/** Notify every active administrator of an organization. */
export async function notifyOrganizationAdmins(params: {
  readonly organizationId: string;
  readonly notificationId: string;
  readonly data?: TemplateValues;
  readonly linkUrl?: string;
  readonly sourceEventId?: string;
}): Promise<number> {
  const admins = await db().organizationMember.findMany({
    where: { organizationId: params.organizationId, roleKey: 'clinic_admin', leftAt: null },
    select: { userId: true },
  });
  for (const admin of admins) {
    await notifyUser({ ...params, userId: admin.userId });
  }
  return admins.length;
}

// ---------------------------------------------------------------------------
// Retry and deferred delivery
// ---------------------------------------------------------------------------

interface DueRecord {
  id: string;
  notificationId: string;
  userId: string;
  channel: keyof typeof DB_TO_CHANNEL;
  status: string;
  attempts: number;
  data: unknown;
}

const DB_TO_CHANNEL = {
  IN_APP: 'in_app',
  PUSH: 'push',
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
} as const;

/**
 * Re-attempt failed channels whose backoff has elapsed, and send messages
 * that were held for quiet hours.
 *
 * Rows are leased with SKIP LOCKED — as the outbox is — so concurrent workers
 * never send the same SMS twice.
 */
export async function processDueNotifications(limit = 50): Promise<{ sent: number; failed: number; abandoned: number }> {
  const rows = await db().$queryRaw<DueRecord[]>`
    UPDATE "notification_records"
    SET "nextAttemptAt" = now() + interval '5 minutes'
    WHERE "id" IN (
      SELECT "id" FROM "notification_records"
      WHERE "nextAttemptAt" <= now()
        AND (("status" = 'FAILED' AND "attempts" < ${MAX_DELIVERY_ATTEMPTS}) OR "status" = 'PENDING')
      ORDER BY "nextAttemptAt"
      LIMIT ${Math.min(Math.max(limit, 1), 500)}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "notificationId", "userId", "channel", "status", "attempts", "data"
  `;

  let sent = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of rows) {
    const stored = (row.data ?? {}) as Record<string, unknown>;

    if (stored.__transient === true) {
      await db().notificationRecord.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          nextAttemptAt: null,
          failedAt: new Date(),
          lastError:
            'Contained a single-use link or code, which is never stored, so it cannot be resent. The user can request a new one.',
        },
      });
      abandoned += 1;
      continue;
    }

    const definition = NOTIFICATION_BY_ID.get(row.notificationId);
    const recipient = definition
      ? await loadRecipient(row.userId, definition.category, definition.transactional)
      : null;

    if (!definition || !recipient) {
      await db().notificationRecord.update({
        where: { id: row.id },
        data: { status: 'SKIPPED', nextAttemptAt: null, lastError: 'Recipient can no longer be contacted.' },
      });
      abandoned += 1;
      continue;
    }

    const channel = DB_TO_CHANNEL[row.channel];
    const { __linkUrl, ...values } = stored;
    const attempts = row.attempts + 1;

    try {
      const receipt = await dispatch(channel, {
        notificationId: row.notificationId,
        recipient,
        data: values as TemplateValues,
        linkUrl: typeof __linkUrl === 'string' ? __linkUrl : undefined,
      });
      await db().notificationRecord.update({
        where: { id: row.id },
        data: {
          status: receipt.status === 'delivered' ? 'DELIVERED' : 'SENT',
          attempts,
          sentAt: new Date(),
          deliveredAt: receipt.status === 'delivered' ? new Date() : null,
          providerMessageId: receipt.providerMessageId,
          lastError: null,
          nextAttemptAt: null,
        },
      });
      sent += 1;
    } catch (error) {
      const appError = toAppError(error);
      await db().notificationRecord.update({
        where: { id: row.id },
        data: {
          status: 'FAILED',
          attempts,
          lastError: appError.code,
          failedAt: new Date(),
          nextAttemptAt: nextAttemptAt(attempts),
        },
      });
      failed += 1;
    }
  }

  return { sent, failed, abandoned };
}

export * from './ports';
