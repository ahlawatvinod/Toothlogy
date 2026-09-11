/**
 * TOOTHLOGY MESSAGING — patients and their practices
 *
 * A patient writes to a practice they have an appointment with — never a
 * practice they have no relationship with, so the inbox cannot become an
 * advertising channel. The practice's members who may read messages see the
 * conversation; those who may reply, reply. Nobody else sees it.
 *
 * - One open conversation per patient, practice and appointment (openKey).
 * - Either side may close a conversation; a closed one takes no messages.
 * - Notifications say a message arrived, never what it says.
 * - 30 messages a day per person.
 */

import { z } from 'zod';
import { Prisma, type MessageSide } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';

export const READ = 'tl.messaging.thread.read';
export const REPLY = 'tl.messaging.thread.reply';
const DAY = 86_400_000;
const MESSAGES_PER_DAY = 30;

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

async function withinDailyLimit(userId: string, now: Date) {
  const sent = await db().message.count({ where: { authorUserId: userId, createdAt: { gte: new Date(now.getTime() - DAY) } } });
  if (sent >= MESSAGES_PER_DAY) throw errors.rateLimited(3600);
}

const body = z.string().trim().min(2, 'Write a message.').max(4000);
export const startThreadSchema = z.object({
  organizationId: z.string().max(64),
  appointmentId: z.string().max(64).optional(),
  subject: z.string().trim().min(3, 'Say what it is about.').max(160),
  body,
});

export async function startThread(principal: Principal, raw: z.input<typeof startThreadSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = startThreadSchema.parse(raw);
  const now = context.now ?? new Date();
  // A relationship first: an appointment with this practice.
  if (input.appointmentId) {
    const appointment = await db().appointment.findFirst({ where: { id: input.appointmentId, patientUserId: me.userId, organizationId: input.organizationId }, select: { id: true } });
    if (!appointment) throw errors.notFound('Appointment');
  } else if ((await db().appointment.count({ where: { patientUserId: me.userId, organizationId: input.organizationId } })) === 0) {
    throw errors.preconditionFailed('You can message a practice once you have an appointment with it.');
  }
  if ((await db().organizationMember.count({ where: { organizationId: input.organizationId, userId: me.userId, leftAt: null } })) > 0) {
    throw errors.preconditionFailed('You work at this practice.');
  }
  await withinDailyLimit(me.userId, now);
  const id = newId('thread');
  try {
    await transaction(async (tx) => {
      await tx.messageThread.create({
        data: { id, organizationId: input.organizationId, patientUserId: me.userId, appointmentId: input.appointmentId ?? null, subject: input.subject, openKey: `${me.userId}:${input.organizationId}:${input.appointmentId ?? '-'}`, lastMessageAt: now, patientReadAt: now },
      });
      const messageId = newId('message');
      await tx.message.create({ data: { id: messageId, threadId: id, authorUserId: me.userId, side: 'PATIENT', body: input.body, createdAt: now } });
      // Thread and sender ids only — never what the message says.
      await emitInTransaction(tx, 'MESSAGE_RECEIVED', { threadId: id, messageId, organizationId: input.organizationId, senderUserId: me.userId, side: 'PATIENT' }, { requestId: context.requestId ?? null, actor: me.userId });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already have an open conversation with this practice about this. Continue it instead.');
    throw error;
  }
  await recordAuditEvent({ action: 'MESSAGE_THREAD_STARTED', actor: me.userId, subject: id, outcome: 'success', organizationId: input.organizationId, requestId: context.requestId });
  // The seeded template reads "New message from {sender}." — who, never what.
  const sender = (await db().user.findUnique({ where: { id: me.userId }, select: { displayName: true } }))?.displayName ?? 'a patient';
  await notifyOrganizationAdmins({ organizationId: input.organizationId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001', data: { sender }, linkUrl: `/account/practice/messages/${id}` });
  return { threadId: id };
}

/** Which side the caller is on in this conversation, or not in it at all. */
async function sideOf(principal: AuthenticatedPrincipal, thread: { patientUserId: string; organizationId: string }, action: 'read' | 'reply'): Promise<MessageSide> {
  if (thread.patientUserId === principal.userId) return 'PATIENT';
  if (can(principal, action === 'reply' ? REPLY : READ, { organizationId: thread.organizationId })) return 'PRACTICE';
  throw errors.notFound('Conversation');
}

export const messageSchema = z.object({ body });

export async function postMessage(principal: Principal, threadId: string, raw: z.input<typeof messageSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = messageSchema.parse(raw);
  const now = context.now ?? new Date();
  const thread = await db().messageThread.findUnique({ where: { id: threadId } });
  if (!thread) throw errors.notFound('Conversation');
  const side = await sideOf(me, thread, 'reply');
  if (thread.status !== 'OPEN') throw errors.preconditionFailed('This conversation is closed. Start a new one if you need to.');
  await withinDailyLimit(me.userId, now);
  const id = newId('message');
  await transaction(async (tx) => {
    const open = await tx.messageThread.updateMany({ where: { id: threadId, status: 'OPEN' }, data: { lastMessageAt: now, ...(side === 'PATIENT' ? { patientReadAt: now } : { practiceReadAt: now }) } });
    if (open.count === 0) throw errors.preconditionFailed('This conversation was closed a moment ago.');
    await tx.message.create({ data: { id, threadId, authorUserId: me.userId, side, body: input.body, createdAt: now } });
    await emitInTransaction(tx, 'MESSAGE_RECEIVED', { threadId, messageId: id, organizationId: thread.organizationId, senderUserId: me.userId, side }, { requestId: context.requestId ?? null, actor: me.userId });
  });
  await recordAuditEvent({ action: 'MESSAGE_SENT', actor: me.userId, subject: threadId, outcome: 'success', organizationId: thread.organizationId, requestId: context.requestId, detail: { side } });
  if (side === 'PATIENT') {
    const sender = (await db().user.findUnique({ where: { id: me.userId }, select: { displayName: true } }))?.displayName ?? 'a patient';
    await notifyOrganizationAdmins({ organizationId: thread.organizationId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001', data: { sender }, linkUrl: `/account/practice/messages/${threadId}` });
  } else {
    const sender = (await db().organization.findUnique({ where: { id: thread.organizationId }, select: { name: true } }))?.name ?? 'your practice';
    await notifyUser({ userId: thread.patientUserId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001', data: { sender }, linkUrl: `/account/messages/${threadId}` });
  }
  return { messageId: id };
}

export async function closeThread(principal: Principal, threadId: string, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const thread = await db().messageThread.findUnique({ where: { id: threadId } });
  if (!thread) throw errors.notFound('Conversation');
  await sideOf(me, thread, 'reply');
  const done = await db().messageThread.updateMany({ where: { id: threadId, status: 'OPEN' }, data: { status: 'CLOSED', openKey: null, closedAt: context.now ?? new Date(), closedByUserId: me.userId } });
  if (done.count === 0) throw errors.preconditionFailed('This conversation is already closed.');
  await recordAuditEvent({ action: 'MESSAGE_THREAD_CLOSED', actor: me.userId, subject: threadId, outcome: 'success', organizationId: thread.organizationId, requestId: context.requestId });
}

/** One conversation with its messages; marks it read for the caller's side. */
export async function getThread(principal: Principal, threadId: string, now: Date = new Date()) {
  const me = signedIn(principal);
  const thread = await db().messageThread.findUnique({
    where: { id: threadId },
    include: {
      organization: { select: { name: true } },
      patient: { select: { displayName: true } },
      appointment: { select: { id: true, startsAt: true, serviceName: true } },
      messages: { orderBy: { createdAt: 'asc' }, take: 500 },
    },
  });
  if (!thread) throw errors.notFound('Conversation');
  const side = await sideOf(me, thread, 'read');
  await db().messageThread.update({ where: { id: threadId }, data: side === 'PATIENT' ? { patientReadAt: now } : { practiceReadAt: now } });
  const canReply = side === 'PATIENT' || can(me, REPLY, { organizationId: thread.organizationId });
  return { thread, side, canReply };
}

const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}…` : text);

export async function listPatientThreads(principal: Principal) {
  const me = signedIn(principal);
  const rows = await db().messageThread.findMany({
    where: { patientUserId: me.userId },
    include: { organization: { select: { name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
  });
  return rows.map((t) => ({ id: t.id, subject: t.subject, status: t.status, organization: t.organization.name, lastMessageAt: t.lastMessageAt, unread: !t.patientReadAt || t.lastMessageAt > t.patientReadAt, last: t.messages[0] ? { side: t.messages[0].side, text: preview(t.messages[0].body) } : null }));
}

export async function listPracticeThreads(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, READ, { organizationId })) throw errors.notFound('Organization');
  const rows = await db().messageThread.findMany({
    where: { organizationId },
    include: { patient: { select: { displayName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
    take: 300,
  });
  return rows.map((t) => ({ id: t.id, subject: t.subject, status: t.status, patient: t.patient.displayName ?? 'Patient', lastMessageAt: t.lastMessageAt, unread: !t.practiceReadAt || t.lastMessageAt > t.practiceReadAt, last: t.messages[0] ? { side: t.messages[0].side, text: preview(t.messages[0].body) } : null }));
}

/** Practices the patient may write to: those they have had an appointment with. */
export async function messageablePractices(principal: Principal) {
  const me = signedIn(principal);
  const rows = await db().appointment.findMany({ where: { patientUserId: me.userId }, select: { organizationId: true, organization: { select: { name: true } } }, distinct: ['organizationId'], take: 50 });
  return rows.map((r) => ({ organizationId: r.organizationId, name: r.organization.name }));
}
