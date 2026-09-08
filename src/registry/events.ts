/**
 * TOOTHLOGY EVENT & NOTIFICATION REGISTRY
 *
 * Domain events are the seam between divisions. A division announces that
 * something happened in its own data; other divisions react without the
 * publisher knowing they exist. This is what keeps 35 divisions from turning
 * into 35 × 34 direct dependencies.
 *
 * Rules that make events safe rather than merely convenient:
 *
 * 1. **Events are facts, in the past tense.** `APPOINTMENT_CONFIRMED`, never
 *    `CONFIRM_APPOINTMENT`. An event is not a command and a subscriber may not
 *    be assumed to exist.
 * 2. **Payloads carry IDs, not sensitive bodies.** `payloadSensitivity` records
 *    the highest classification a payload may contain; a `phi` payload may never
 *    be logged or shipped to an external analytics provider.
 * 3. **Every event name is registered here before it is published.** The event
 *    bus rejects unregistered names, so a typo fails immediately instead of
 *    silently dropping a subscriber.
 *
 * STATUS: the event *bus* is implemented (`src/platform/events`). The event
 * *definitions* below are 🟡 PREPARED — typed contracts with no publishers yet,
 * because the divisions that would publish them are not built.
 */

import type { EventDefinition, NotificationDefinition } from './types';

export const EVENTS: readonly EventDefinition[] = [
  {
    id: 'TL-EVT-USER-CREATED-001',
    event: 'USER_CREATED',
    name: 'User created',
    description: 'A new user account was created and is ready for onboarding.',
    status: 'prepared',
    phase: 1,
    divisionId: 'TL-DIV-01-CORE',
    payloadSensitivity: 'internal',
    notifies: ['TL-NOTIF-WELCOME-001'],
  },
  {
    id: 'TL-EVT-DENTIST-VERIFIED-001',
    event: 'DENTIST_VERIFIED',
    name: 'Dentist verified',
    description:
      'A dentist licence or registration passed verification. Revocable — a later revocation is its own event, never a deletion of this one (Constitution P2).',
    status: 'prepared',
    phase: 3,
    divisionId: 'TL-DIV-04-DENTISTS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-VERIFICATION-RESULT-001'],
  },
  {
    id: 'TL-EVT-CLINIC-VERIFIED-001',
    event: 'CLINIC_VERIFIED',
    name: 'Clinic verified',
    description: 'A clinic or hospital passed organizational verification.',
    status: 'prepared',
    phase: 3,
    divisionId: 'TL-DIV-05-CLINICS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-VERIFICATION-RESULT-001'],
  },
  {
    id: 'TL-EVT-APPOINTMENT-CREATED-001',
    event: 'APPOINTMENT_CREATED',
    name: 'Appointment created',
    description: 'A patient requested an appointment slot. Not yet confirmed by the practice.',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-APPOINTMENT-CREATED-001'],
  },
  {
    id: 'TL-EVT-APPOINTMENT-CONFIRMED-001',
    event: 'APPOINTMENT_CONFIRMED',
    name: 'Appointment confirmed',
    description:
      'The practice confirmed the appointment. This is the moment the BOOK pillar promise becomes binding.',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-APPOINTMENT-CONFIRMED-001', 'TL-NOTIF-APPOINTMENT-REMINDER-001'],
  },
  {
    id: 'TL-EVT-APPOINTMENT-CANCELLED-001',
    event: 'APPOINTMENT_CANCELLED',
    name: 'Appointment cancelled',
    description:
      'The appointment was cancelled. The payload records who cancelled it, because refund and no-show rules depend on that.',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-APPOINTMENT-CANCELLED-001'],
  },
  {
    id: 'TL-EVT-LEAD-CREATED-001',
    event: 'LEAD_CREATED',
    name: 'Lead created',
    description: 'A patient-intent lead was generated and is available for offer to practices.',
    status: 'prepared',
    phase: 10,
    divisionId: 'TL-DIV-20-LEADS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-LEAD-OFFER-001'],
  },
  {
    id: 'TL-EVT-LEAD-ACCEPTED-001',
    event: 'LEAD_ACCEPTED',
    name: 'Lead accepted',
    description: 'A practice accepted a lead and the associated charge became payable.',
    status: 'prepared',
    phase: 10,
    divisionId: 'TL-DIV-20-LEADS',
    payloadSensitivity: 'confidential',
    notifies: [],
  },
  {
    id: 'TL-EVT-PAYMENT-COMPLETED-001',
    event: 'PAYMENT_COMPLETED',
    name: 'Payment completed',
    description:
      'A payment was captured and confirmed by the provider. Emitted only on provider confirmation — never optimistically (Constitution P10).',
    status: 'prepared',
    phase: 4,
    divisionId: 'TL-DIV-23-PAYMENTS',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-PAYMENT-RECEIPT-001'],
  },
  {
    id: 'TL-EVT-REVIEW-CREATED-001',
    event: 'REVIEW_CREATED',
    name: 'Review created',
    description: 'A review was submitted and entered moderation.',
    status: 'prepared',
    phase: 5,
    divisionId: 'TL-DIV-26-REVIEWS',
    payloadSensitivity: 'internal',
    notifies: ['TL-NOTIF-REVIEW-RECEIVED-001'],
  },
  {
    id: 'TL-EVT-MESSAGE-RECEIVED-001',
    event: 'MESSAGE_RECEIVED',
    name: 'Message received',
    description:
      'A message arrived in a thread. The payload carries thread and sender IDs only — never message content.',
    status: 'prepared',
    phase: 5,
    divisionId: 'TL-DIV-25-COMMUNICATION',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-NEW-MESSAGE-001'],
  },
  {
    id: 'TL-EVT-ORDER-CREATED-001',
    event: 'ORDER_CREATED',
    name: 'Order created',
    description: 'A marketplace order was placed.',
    status: 'prepared',
    phase: 9,
    divisionId: 'TL-DIV-16-MARKETPLACE',
    payloadSensitivity: 'confidential',
    notifies: ['TL-NOTIF-ORDER-CONFIRMATION-001'],
  },
  {
    id: 'TL-EVT-DEVICE-CONNECTED-001',
    event: 'DEVICE_CONNECTED',
    name: 'Device connected',
    description: 'An IoT dental device paired with a clinic and began reporting telemetry.',
    status: 'prepared',
    phase: 11,
    divisionId: 'TL-DIV-28-IOT',
    payloadSensitivity: 'internal',
    notifies: [],
  },
] as const;

export const EVENT_BY_NAME: ReadonlyMap<string, EventDefinition> = new Map(
  EVENTS.map((e) => [e.event, e]),
);

export const EVENT_NAMES = EVENTS.map((e) => e.event);

export function isKnownEvent(name: string): boolean {
  return EVENT_BY_NAME.has(name);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * `transactional: true` means the notification is part of a service the user
 * asked for — a booking confirmation, a payment receipt — and is delivered even
 * if the user has opted out of marketing. `transactional: false` must respect
 * marketing consent in every channel and in every jurisdiction.
 *
 * Getting this boolean wrong is a compliance incident, not a UX bug, which is
 * why it is a required field rather than an inferred default.
 */
export const NOTIFICATIONS: readonly NotificationDefinition[] = [
  {
    id: 'TL-NOTIF-WELCOME-001',
    name: 'Welcome',
    description: 'Onboarding message sent after account creation.',
    status: 'prepared',
    phase: 1,
    channels: ['in_app', 'email'],
    transactional: true,
    divisionId: 'TL-DIV-01-CORE',
  },
  {
    id: 'TL-NOTIF-VERIFICATION-RESULT-001',
    name: 'Verification result',
    description: 'Informs a dentist or clinic that verification succeeded, failed or was revoked.',
    status: 'prepared',
    phase: 3,
    channels: ['in_app', 'email', 'sms'],
    transactional: true,
    divisionId: 'TL-DIV-26-REVIEWS',
  },
  {
    id: 'TL-NOTIF-APPOINTMENT-CREATED-001',
    name: 'Appointment requested',
    description: 'Tells the practice a new booking request needs a decision.',
    status: 'prepared',
    phase: 4,
    channels: ['in_app', 'push', 'email'],
    transactional: true,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
  },
  {
    id: 'TL-NOTIF-APPOINTMENT-CONFIRMED-001',
    name: 'Appointment confirmed',
    description: 'Confirms the booking to the patient with time, place and preparation notes.',
    status: 'prepared',
    phase: 4,
    channels: ['in_app', 'push', 'email', 'sms', 'whatsapp'],
    transactional: true,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
  },
  {
    id: 'TL-NOTIF-APPOINTMENT-CANCELLED-001',
    name: 'Appointment cancelled',
    description: 'Notifies both sides of a cancellation and any refund consequence.',
    status: 'prepared',
    phase: 4,
    channels: ['in_app', 'push', 'email', 'sms'],
    transactional: true,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
  },
  {
    id: 'TL-NOTIF-APPOINTMENT-REMINDER-001',
    name: 'Appointment reminder',
    description:
      'Reminder ahead of the appointment, scheduled in the patient’s own timezone rather than the clinic’s.',
    status: 'prepared',
    phase: 4,
    channels: ['push', 'sms', 'whatsapp'],
    transactional: true,
    divisionId: 'TL-DIV-09-APPOINTMENTS',
  },
  {
    id: 'TL-NOTIF-PAYMENT-RECEIPT-001',
    name: 'Payment receipt',
    description: 'Receipt issued after a confirmed capture, with tax breakdown.',
    status: 'prepared',
    phase: 4,
    channels: ['in_app', 'email'],
    transactional: true,
    divisionId: 'TL-DIV-23-PAYMENTS',
  },
  {
    id: 'TL-NOTIF-LEAD-OFFER-001',
    name: 'Lead offer',
    description: 'Offers a new patient lead to an eligible practice.',
    status: 'prepared',
    phase: 10,
    channels: ['in_app', 'push', 'sms'],
    transactional: true,
    divisionId: 'TL-DIV-20-LEADS',
  },
  {
    id: 'TL-NOTIF-REVIEW-RECEIVED-001',
    name: 'Review received',
    description: 'Tells a practice a review was published and may be responded to.',
    status: 'prepared',
    phase: 5,
    channels: ['in_app', 'email'],
    transactional: true,
    divisionId: 'TL-DIV-26-REVIEWS',
  },
  {
    id: 'TL-NOTIF-NEW-MESSAGE-001',
    name: 'New message',
    description: 'Alerts a participant to a new message without including its content.',
    status: 'prepared',
    phase: 5,
    channels: ['in_app', 'push'],
    transactional: true,
    divisionId: 'TL-DIV-25-COMMUNICATION',
  },
  {
    id: 'TL-NOTIF-ORDER-CONFIRMATION-001',
    name: 'Order confirmation',
    description: 'Confirms a marketplace order and its expected fulfilment.',
    status: 'prepared',
    phase: 9,
    channels: ['in_app', 'email', 'sms'],
    transactional: true,
    divisionId: 'TL-DIV-16-MARKETPLACE',
  },
] as const;

export const NOTIFICATION_BY_ID: ReadonlyMap<string, NotificationDefinition> = new Map(
  NOTIFICATIONS.map((n) => [n.id, n]),
);
