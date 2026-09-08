/**
 * TOOTHLOGY PAYMENT PORTS
 *
 * Founding spec §15. Provider-abstracted, idempotent, and never faking success.
 *
 * The abstraction is not speculative: Toothlogy launches in India, where
 * Razorpay/UPI is the practical choice, and expands to markets where Stripe is.
 * Committing to one SDK inside the booking flow would make the second market a
 * rewrite of the first market's payment code (Constitution P5).
 *
 * Three properties this port enforces:
 *
 * - **Money is `Money`**, never a float (Constitution §4).
 * - **Every mutating call takes an `idempotencyKey`.** It is a required field,
 *   not optional. Payment retries are routine — flaky mobile networks, user
 *   double-taps, webhook redelivery — and without a key each retry is a second
 *   charge.
 * - **Webhook verification is part of the port.** A payment webhook that is not
 *   signature-verified is an unauthenticated endpoint that marks orders paid.
 *   Making verification a port method means no adapter can omit it.
 *
 * 🟡 PREPARED. No adapter is registered; every call throws `NOT_CONFIGURED`.
 * Nothing in this codebase can report a payment as successful (Constitution P10).
 */

import type { Money } from '../money';
import { createProviderSlot } from '../integrations/provider';

/**
 * Payment lifecycle.
 *
 * `requires_action` is explicit because it is the normal path in India: UPI and
 * 3-D Secure both hand control to the user's own app or bank before completion.
 * A model with only pending/succeeded/failed forces that state to be
 * misrepresented as one of the three, and then the UI lies to the user.
 */
export type PaymentStatus =
  | 'created'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentIntentInput {
  readonly amount: Money;
  /** Our own reference — an order or appointment ID — for reconciliation. */
  readonly reference: string;
  readonly description: string;
  readonly customerEmail?: string;
  readonly customerPhone?: string;
  /** Required. Makes a retried request return the original intent. */
  readonly idempotencyKey: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface PaymentIntent {
  readonly providerIntentId: string;
  readonly status: PaymentStatus;
  readonly amount: Money;
  readonly reference: string;
  /** Where to send the user when the status is `requires_action`. */
  readonly actionUrl?: string;
  /** Provider-side client secret for browser SDKs. Never logged. */
  readonly clientSecret?: string;
  readonly createdAt: Date;
}

export interface RefundInput {
  readonly providerPaymentId: string;
  /** Omit for a full refund. */
  readonly amount?: Money;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface Refund {
  readonly providerRefundId: string;
  readonly amount: Money;
  readonly status: 'pending' | 'succeeded' | 'failed';
  readonly createdAt: Date;
}

/** A verified provider webhook. Only ever produced by `verifyWebhook`. */
export interface PaymentWebhookEvent {
  readonly providerEventId: string;
  readonly type: string;
  readonly providerPaymentId: string;
  readonly status: PaymentStatus;
  readonly amount: Money | null;
  readonly reference: string | null;
  readonly occurredAt: Date;
}

export interface PaymentPort {
  createIntent(input: PaymentIntentInput): Promise<PaymentIntent>;

  /** Fetch current status. The source of truth is always the provider. */
  getIntent(providerIntentId: string): Promise<PaymentIntent>;

  capture(providerIntentId: string, idempotencyKey: string): Promise<PaymentIntent>;

  cancel(providerIntentId: string, idempotencyKey: string): Promise<PaymentIntent>;

  refund(input: RefundInput): Promise<Refund>;

  /**
   * Verify a webhook signature and parse the payload.
   *
   * Returns `null` when the signature does not verify — the caller must treat
   * that as a rejected request, never as an unknown event type. An unverified
   * webhook is an anonymous internet caller claiming a payment succeeded.
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string,
  ): Promise<PaymentWebhookEvent | null>;
}

export const paymentProvider = createProviderSlot<PaymentPort>('payment gateway');
