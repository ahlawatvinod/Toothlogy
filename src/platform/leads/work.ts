/**
 * TOOTHLOGY LEAD WORK — who is working a lead, the calls made, the next call.
 *
 * A practice administrator assigns an open lead to a member of the practice.
 * Whoever works it (the assignee, an administrator, or the lead's own
 * dentist) logs each call with its outcome, adds notes and schedules the next
 * follow-up. Everything is a lead event — the same append-only history as the
 * lead's status changes — so nothing about a lead lives in two places.
 *
 * - A call can only be logged once the patient's number is visible to the
 *   practice: a booking, or a callback lead that is free or paid for.
 * - A connected call on an accepted lead marks it contacted.
 * - A due follow-up sends one in-app reminder (claimed per follow-up time) to
 *   the assignee, or to the administrators when nobody is assigned. It names
 *   no patient.
 */

import { z } from 'zod';
import type { LeadStatus as DbLeadStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type Principal } from '../rbac';
import { assertPracticeAccess } from './service';

/** Statuses in which a lead is still being worked. */
const OPEN: DbLeadStatus[] = ['DELIVERED', 'ACCEPTED', 'CONTACTED', 'APPOINTMENT'];
const RELEASED = ['CHARGED', 'WAIVED', 'REFUNDED', 'FREE'];
export const CALL_OUTCOMES = ['CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'NOT_INTERESTED'] as const;

const when = z.string().datetime({ offset: true });

export const leadWorkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ASSIGN'), assigneeUserId: z.string().max(64).nullable() }),
  z.object({ kind: z.literal('CALL'), outcome: z.enum(CALL_OUTCOMES), note: z.string().trim().max(1000).optional(), followUpAt: when.optional() }),
  z.object({ kind: z.literal('FOLLOW_UP'), at: when.nullable(), note: z.string().trim().max(1000).optional() }),
  z.object({ kind: z.literal('NOTE'), note: z.string().trim().min(2, 'Write a note.').max(1000) }),
]);
export type LeadWork = z.infer<typeof leadWorkSchema>;

async function assertCanWork(principal: Principal, lead: { organizationId: string; dentistProfileId: string | null; assignedToUserId: string | null }, kind: LeadWork['kind']): Promise<string> {
  if (!isAuthenticated(principal)) throw errors.notFound('Lead');
  if (kind === 'ASSIGN') {
    await assertPracticeAccess(principal, lead, 'tl.leads.lead.manage');
    return principal.userId;
  }
  await assertPracticeAccess(principal, lead, 'tl.leads.lead.read');
  if (can(principal, 'tl.leads.lead.manage', { organizationId: lead.organizationId })) return principal.userId;
  if (lead.assignedToUserId === principal.userId) return principal.userId;
  if (lead.dentistProfileId) {
    const profile = await db().dentistProfile.findUnique({ where: { id: lead.dentistProfileId }, select: { userId: true } });
    if (profile?.userId === principal.userId) return principal.userId;
  }
  throw errors.forbidden('tl.leads.lead.manage');
}

function future(iso: string, now: Date, field: string): Date {
  const at = new Date(iso);
  if (at.getTime() < now.getTime() - 60_000) throw errors.validation('Choose a time in the future.', { field });
  if (at.getTime() > now.getTime() + 366 * 86_400_000) throw errors.validation('Choose a time within a year.', { field });
  return at;
}

export async function workOnLead(principal: Principal, leadId: string, raw: z.input<typeof leadWorkSchema>, context: { requestId?: string; now?: Date } = {}) {
  const input = leadWorkSchema.parse(raw);
  const now = context.now ?? new Date();
  const lead = await db().lead.findUnique({ where: { id: leadId } });
  if (!lead) throw errors.notFound('Lead');
  const actor = await assertCanWork(principal, lead, input.kind);
  if (input.kind !== 'NOTE' && !OPEN.includes(lead.status)) {
    throw errors.preconditionFailed(`A lead that is ${lead.status.toLowerCase().replace('_', ' ')} is no longer being worked.`);
  }
  const event = (action: string, detail: Record<string, unknown>, to: DbLeadStatus = lead.status) => ({
    id: newId('leadEvent'),
    leadId: lead.id,
    action,
    fromStatus: lead.status,
    toStatus: to,
    actorUserId: actor,
    reason: null,
    detail: detail as never,
  });

  let assignee: string | null = null;
  if (input.kind === 'ASSIGN' && input.assigneeUserId) {
    const member = await db().organizationMember.findFirst({ where: { organizationId: lead.organizationId, userId: input.assigneeUserId, leftAt: null }, select: { userId: true } });
    if (!member) throw errors.validation('That person is not a member of this practice.', { field: 'assigneeUserId' });
    assignee = member.userId;
  }
  if (input.kind === 'CALL' && !(lead.source === 'BOOKING' || RELEASED.includes(lead.billingStatus))) {
    throw errors.preconditionFailed('The patient’s number is shown once the lead is free or paid for; log the call then.');
  }
  const followUp = input.kind === 'CALL' && input.followUpAt ? future(input.followUpAt, now, 'followUpAt') : input.kind === 'FOLLOW_UP' && input.at ? future(input.at, now, 'at') : null;

  await transaction(async (tx) => {
    // Every write is conditional on the status read above: a lead that moved
    // on meanwhile is refused rather than annotated out of date.
    const guard = { id: lead.id, status: lead.status };
    if (input.kind === 'ASSIGN') {
      const claim = await tx.lead.updateMany({ where: guard, data: { assignedToUserId: assignee, assignedAt: assignee ? now : null } });
      if (claim.count === 0) throw errors.conflict('This lead changed while you were acting on it. Refresh and try again.');
      await tx.leadEvent.create({ data: event(assignee ? 'ASSIGNED' : 'UNASSIGNED', { assigneeUserId: assignee }) });
    } else if (input.kind === 'CALL') {
      const contacted = input.outcome === 'CONNECTED' && lead.status === 'ACCEPTED';
      const claim = await tx.lead.updateMany({
        where: guard,
        data: { ...(contacted ? { status: 'CONTACTED', contactedAt: now } : {}), ...(followUp ? { nextFollowUpAt: followUp, followUpNotifiedAt: null } : {}) },
      });
      if (claim.count === 0) throw errors.conflict('This lead changed while you were acting on it. Refresh and try again.');
      await tx.leadEvent.create({ data: event('CALL_LOGGED', { outcome: input.outcome, note: input.note ?? null, followUpAt: followUp?.toISOString() ?? null }, contacted ? 'CONTACTED' : lead.status) });
    } else if (input.kind === 'FOLLOW_UP') {
      const claim = await tx.lead.updateMany({ where: guard, data: { nextFollowUpAt: followUp, followUpNotifiedAt: null } });
      if (claim.count === 0) throw errors.conflict('This lead changed while you were acting on it. Refresh and try again.');
      await tx.leadEvent.create({ data: event(followUp ? 'FOLLOW_UP_SET' : 'FOLLOW_UP_CLEARED', { at: followUp?.toISOString() ?? null, note: input.note ?? null }) });
    } else {
      await tx.leadEvent.create({ data: event('NOTE', { note: input.note }) });
    }
  });

  await recordAuditEvent({ action: `LEAD_WORK_${input.kind}`, actor, subject: lead.id, outcome: 'success', organizationId: lead.organizationId, requestId: context.requestId });
  if (input.kind === 'ASSIGN' && assignee && assignee !== actor) {
    await notifyUser({ userId: assignee, notificationId: 'TL-NOTIF-LEAD-ASSIGNED-001', data: { summary: 'A patient lead was assigned to you.' }, linkUrl: '/account/practice/leads?mine=1', requestId: context.requestId });
  }
  return db().lead.findUniqueOrThrow({ where: { id: lead.id }, select: { id: true, status: true, assignedToUserId: true, nextFollowUpAt: true } });
}

/** The work history of one lead: calls, notes, assignments and follow-ups, newest first. */
export async function leadWorkLog(leadId: string, take = 10) {
  return db().leadEvent.findMany({
    where: { leadId, action: { in: ['CALL_LOGGED', 'NOTE', 'ASSIGNED', 'UNASSIGNED', 'FOLLOW_UP_SET', 'FOLLOW_UP_CLEARED'] } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

/**
 * Remind whoever is working each lead whose follow-up has come due. Each
 * follow-up time is claimed once, so overlapping runs send one reminder.
 */
export async function sendDueLeadFollowUps(now: Date = new Date()): Promise<{ due: number; sent: number }> {
  const due = await db().lead.findMany({
    where: { nextFollowUpAt: { lte: now }, followUpNotifiedAt: null, status: { in: OPEN } },
    select: { id: true, organizationId: true, assignedToUserId: true, nextFollowUpAt: true },
    orderBy: { nextFollowUpAt: 'asc' },
    take: 200,
  });
  let sent = 0;
  for (const lead of due) {
    const claim = await db().lead.updateMany({ where: { id: lead.id, followUpNotifiedAt: null, nextFollowUpAt: lead.nextFollowUpAt }, data: { followUpNotifiedAt: now } });
    if (claim.count === 0) continue;
    const message = { notificationId: 'TL-NOTIF-LEAD-FOLLOW-UP-001', data: { summary: 'A patient lead is due its follow-up call.' }, linkUrl: '/account/practice/leads?due=1' };
    if (lead.assignedToUserId) await notifyUser({ userId: lead.assignedToUserId, ...message });
    else await notifyOrganizationAdmins({ organizationId: lead.organizationId, ...message });
    sent += 1;
  }
  return { due: due.length, sent };
}
