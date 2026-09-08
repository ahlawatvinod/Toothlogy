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
 *   2. intersect its channels with the user's preferences
 *   3. drop marketing channels the user has not consented to
 *   4. send on each surviving channel, independently
 *   5. return a per-channel result — including failures
 *
 * Step 3 is the one with legal weight. Transactional notifications ignore
 * marketing opt-out because the user asked for the underlying service;
 * marketing must never (founding spec §13).
 *
 * 🟡 PREPARED. No provider adapters are registered, so every send currently
 * fails with `NOT_CONFIGURED` — reported honestly per channel, never as success
 * (Constitution P10).
 */

import { NOTIFICATION_BY_ID } from '@/registry/events';
import type { NotificationChannel } from '@/registry/types';
import { hasDatabase } from '../config';
import { errors, toAppError } from '../kernel/errors';
import { logger } from '../observability/logger';
import { deliverInApp, recordDelivery, renderInApp } from './delivery';
import {
  type DeliveryReceipt,
  emailProvider,
  pushProvider,
  smsProvider,
  whatsAppProvider,
} from './ports';

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
}

export interface NotificationRequest {
  /** Registered notification ID, e.g. `TL-NOTIF-APPOINTMENT-CONFIRMED-001`. */
  readonly notificationId: string;
  readonly recipient: NotificationRecipient;
  /** Values interpolated into the message template. */
  readonly data?: Readonly<Record<string, string | number>>;
  readonly requestId?: string;
}

export interface ChannelOutcome {
  readonly channel: NotificationChannel;
  readonly status: 'sent' | 'skipped' | 'failed';
  readonly reason?: string;
  readonly receipt?: DeliveryReceipt;
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
 * Send a notification.
 *
 * Channels are dispatched independently: SMS failing must not prevent the email.
 * Every outcome is reported, and a total failure returns a result with
 * `anyDelivered: false` rather than throwing — the caller usually cannot undo
 * the thing that triggered the notification, so it needs a report, not an
 * exception.
 */
export async function sendNotification(
  request: NotificationRequest,
): Promise<NotificationResult> {
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

  const log = logger.child({
    notificationId: request.notificationId,
    requestId: request.requestId,
  });

  const results = await Promise.all(
    selected.map(async (channel): Promise<ChannelOutcome> => {
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

  // Persist the delivery trail, when a database is available. Best-effort and
  // never awaited into the failure path: losing the record costs an audit
  // trail, whereas throwing here would fail the action that triggered the
  // notification.
  if (hasDatabase()) {
    await Promise.all(
      outcomes.map((outcome) =>
        recordDelivery({
          notificationId: request.notificationId,
          userId: request.recipient.userId,
          channel: outcome.channel,
          outcome,
          data: request.data,
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

/**
 * Route to the channel's provider.
 *
 * Message bodies are placeholders pending the template system (Division 25,
 * Phase 5). They are never sent — every provider slot is empty, so each of
 * these calls throws `NOT_CONFIGURED` before any content is transmitted.
 */
async function dispatch(
  channel: NotificationChannel,
  request: NotificationRequest,
): Promise<DeliveryReceipt> {
  const { recipient, notificationId } = request;

  switch (channel) {
    case 'email':
      return emailProvider.get().send({
        to: recipient.email!,
        subject: notificationId,
        textBody: notificationId,
      });

    case 'sms':
      return smsProvider.get().send({ to: recipient.phone!, body: notificationId });

    case 'whatsapp':
      return whatsAppProvider.get().send({
        to: recipient.phone!,
        templateName: notificationId,
        languageCode: recipient.locale,
      });

    case 'push':
      return pushProvider.get().send({
        tokens: recipient.pushTokens ?? [],
        title: notificationId,
        body: notificationId,
      });

    case 'in_app': {
      /*
       * In-app is the one channel with no external provider: it is a row in our
       * own database. That makes it the reliable floor beneath every other
       * channel — when email and SMS are unconfigured, the user still finds a
       * record of what happened waiting for them.
       */
      if (!hasDatabase()) throw errors.notConfigured('database');

      const rendered = await renderInApp(notificationId, recipient.locale, request.data);
      if (!rendered) throw errors.validation(`No template for '${notificationId}'.`);

      const created = await deliverInApp({
        notificationId,
        userId: recipient.userId,
        title: rendered.title,
        body: rendered.body,
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

export * from './ports';
