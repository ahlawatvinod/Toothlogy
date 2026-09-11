/**
 * TOOTHLOGY VIDEO PORT
 *
 * Video consultations book a time through the appointment engine today. The
 * meeting itself — a room, its links, its lifetime — comes from a provider
 * behind this port. None is connected: the slot is NOT_CONFIGURED, every call
 * rejects with that error, and no screen ever shows a meeting link that a
 * provider did not issue (Constitution P10).
 *
 * Every mutating call takes an idempotency key, because meeting creation is
 * retried by the outbox and a retry must not open a second room.
 */

import { createProviderSlot } from '../integrations/provider';

export interface VideoMeetingRequest {
  readonly appointmentId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Shown by the provider to the participants; never used for access. */
  readonly title: string;
  readonly hostName: string;
  readonly participantName: string;
  /** Required: `video:<appointmentId>:<startsAt>`, so a retry returns the same room. */
  readonly idempotencyKey: string;
}

export interface ProvisionedVideoMeeting {
  /** The provider's name, stored with the meeting (e.g. "zoom"). */
  readonly provider: string;
  readonly externalMeetingId: string;
  /** The participant's (patient's) join link. */
  readonly joinUrl: string;
  /** The host's (dentist's) link, where the provider issues a separate one. */
  readonly hostUrl?: string;
  /** After this instant the links stop working. */
  readonly expiresAt: Date;
}

export interface VideoPort {
  createMeeting(request: VideoMeetingRequest): Promise<ProvisionedVideoMeeting>;
  cancelMeeting(externalMeetingId: string, idempotencyKey: string): Promise<void>;
}

export const videoProvider = createProviderSlot<VideoPort>('video');
