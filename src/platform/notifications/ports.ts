/**
 * TOOTHLOGY NOTIFICATION PORTS
 *
 * Founding spec §13. Channels: in-app, push, email, SMS, and WhatsApp where
 * legally and technically supported.
 *
 * Every port returns a `DeliveryReceipt` rather than `void`. "Fire and forget"
 * is wrong for this domain: an appointment reminder that silently failed is a
 * missed appointment, and the platform needs to know delivery was attempted,
 * accepted by the provider, and — where the channel supports it — actually
 * delivered.
 *
 * 🟡 PREPARED. Ports and slots exist; no adapter is registered. Every call
 * currently throws `NOT_CONFIGURED` (Constitution P10).
 */

import type { NotificationChannel } from '@/registry/types';
import { createProviderSlot } from '../integrations/provider';

export interface DeliveryReceipt {
  /** Provider-side ID, for reconciling delivery webhooks later. */
  readonly providerMessageId: string;
  readonly channel: NotificationChannel;
  readonly acceptedAt: Date;
  /** `accepted` means the provider took it, not that it reached the recipient. */
  readonly status: 'accepted' | 'queued' | 'delivered' | 'failed';
}

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string;
  readonly replyTo?: string;
  /** Provider template ID, when the provider renders the content. */
  readonly templateId?: string;
  readonly templateData?: Readonly<Record<string, string | number>>;
}

export interface EmailPort {
  send(message: EmailMessage): Promise<DeliveryReceipt>;
}

export interface SmsMessage {
  /** E.164 format, e.g. `+919876543210`. */
  readonly to: string;
  readonly body: string;
  /**
   * India's DLT regime requires SMS to be sent against a pre-registered
   * template. The adapter enforces that; callers supply the ID.
   */
  readonly templateId?: string;
  readonly senderId?: string;
}

export interface SmsPort {
  send(message: SmsMessage): Promise<DeliveryReceipt>;
}

export interface WhatsAppMessage {
  readonly to: string;
  readonly templateName: string;
  readonly languageCode: string;
  readonly parameters?: readonly string[];
  /**
   * Free-form text is only permitted inside the 24-hour customer service
   * window; outside it the provider requires an approved template. The adapter
   * enforces the rule so no caller has to remember it.
   */
  readonly freeFormBody?: string;
}

export interface WhatsAppPort {
  send(message: WhatsAppMessage): Promise<DeliveryReceipt>;
}

export interface PushMessage {
  /** Device tokens. One message may fan out to several devices. */
  readonly tokens: readonly string[];
  readonly title: string;
  readonly body: string;
  /** Deep-link data. Never include clinical content — push previews are visible on lock screens. */
  readonly data?: Readonly<Record<string, string>>;
}

export interface PushPort {
  send(message: PushMessage): Promise<DeliveryReceipt>;
}

export const emailProvider = createProviderSlot<EmailPort>('email');
export const smsProvider = createProviderSlot<SmsPort>('SMS');
export const whatsAppProvider = createProviderSlot<WhatsAppPort>('WhatsApp');
export const pushProvider = createProviderSlot<PushPort>('push notification');
