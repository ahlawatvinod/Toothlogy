/**
 * Video meetings for VIDEO appointments.
 *
 * A meeting row exists only once a connected provider has created a room.
 * With no provider, `provisionVideoMeeting` reports NOT_CONFIGURED and writes
 * nothing, and `videoMeetingView` tells the screens to say so — the clinic
 * sends the link itself. A link is shown only if a provider returned it, only
 * while the meeting is scheduled, and only to the appointment's patient and
 * practice.
 */

import { db } from '../db/client';
import { newId } from '../kernel/ids';
import { videoProvider } from './ports';

export type ProvisionOutcome =
  | { status: 'SCHEDULED'; meetingId: string; replayed: boolean }
  | { status: 'NOT_CONFIGURED' }
  | { status: 'SKIPPED'; reason: string };

/** Create (or keep) the room for a confirmed video appointment. Idempotent. */
export async function provisionVideoMeeting(appointmentId: string): Promise<ProvisionOutcome> {
  const a = await db().appointment.findUnique({
    where: { id: appointmentId },
    include: {
      videoMeeting: true,
      patient: { select: { displayName: true } },
      dentistProfile: { select: { userId: true, user: { select: { displayName: true } } } },
    },
  });
  if (!a) return { status: 'SKIPPED', reason: 'No such appointment.' };
  if (a.type !== 'VIDEO') return { status: 'SKIPPED', reason: 'Not a video appointment.' };
  if (a.status !== 'CONFIRMED') return { status: 'SKIPPED', reason: `Appointment is ${a.status.toLowerCase()}.` };

  const current = a.videoMeeting;
  if (current && current.status === 'SCHEDULED' && current.startsAt.getTime() === a.startsAt.getTime()) {
    return { status: 'SCHEDULED', meetingId: current.id, replayed: true };
  }
  if (!videoProvider.isConfigured()) return { status: 'NOT_CONFIGURED' };

  // The time moved: the old room goes before the new one is made.
  if (current && current.status === 'SCHEDULED') await cancelVideoMeeting(appointmentId);

  const created = await videoProvider.get().createMeeting({
    appointmentId: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    title: `${a.serviceName} with ${a.dentistProfile.user.displayName ?? 'your dentist'}`,
    hostName: a.dentistProfile.user.displayName ?? 'Dentist',
    participantName: a.patient.displayName ?? 'Patient',
    idempotencyKey: `video:${a.id}:${a.startsAt.toISOString()}`,
  });
  const data = {
    provider: created.provider,
    externalMeetingId: created.externalMeetingId,
    joinUrl: created.joinUrl,
    hostUrl: created.hostUrl ?? null,
    hostUserId: a.dentistProfile.userId,
    participantUserId: a.patientUserId,
    startsAt: a.startsAt,
    expiresAt: created.expiresAt,
    status: 'SCHEDULED' as const,
    cancelledAt: null,
  };
  const meeting = await db().videoMeeting.upsert({
    where: { appointmentId: a.id },
    create: { id: newId('videoMeeting'), appointmentId: a.id, ...data },
    update: data,
  });
  return { status: 'SCHEDULED', meetingId: meeting.id, replayed: false };
}

/** Close the room for an appointment that is no longer going ahead. Idempotent. */
export async function cancelVideoMeeting(appointmentId: string): Promise<{ cancelled: boolean }> {
  const meeting = await db().videoMeeting.findUnique({ where: { appointmentId } });
  if (!meeting || meeting.status !== 'SCHEDULED') return { cancelled: false };
  // A room created by a provider is cancelled with that provider. If it has
  // since been disconnected the call fails loudly (NOT_CONFIGURED) and the
  // outbox retries; the row is not marked cancelled on a guess.
  await videoProvider.get().cancelMeeting(meeting.externalMeetingId, `video-cancel:${meeting.id}`);
  const claim = await db().videoMeeting.updateMany({ where: { id: meeting.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  return { cancelled: claim.count > 0 };
}

/** What an appointment screen may show about the video meeting. */
export async function videoMeetingView(appointmentId: string, viewer: 'PATIENT' | 'PRACTICE') {
  const meeting = await db().videoMeeting.findUnique({ where: { appointmentId } });
  const usable = meeting && meeting.status === 'SCHEDULED' && meeting.expiresAt.getTime() > Date.now();
  return {
    providerConfigured: videoProvider.isConfigured(),
    status: meeting?.status ?? null,
    link: usable ? (viewer === 'PRACTICE' ? (meeting.hostUrl ?? meeting.joinUrl) : meeting.joinUrl) : null,
    expiresAt: usable ? meeting.expiresAt : null,
  };
}
