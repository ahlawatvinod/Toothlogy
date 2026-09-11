/**
 * TOOTHLOGY SUPPORT — tickets to Toothlogy's team
 *
 * Anyone signed in may ask for help, by category, optionally about an
 * organization they belong to. Support staff see every ticket, reply, keep
 * internal notes the requester never sees, assign, resolve and close. A
 * requester's reply reopens a resolved ticket; a closed one stays closed.
 *
 * - 5 new tickets a day per person.
 * - The requester is told of each staff reply and resolution — not of
 *   internal notes.
 */

import { z } from 'zod';
import type { SupportTicketStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';

export const WORK = 'tl.support.ticket.work';
const DAY = 86_400_000;
const TICKETS_PER_DAY = 5;
export const SUPPORT_CATEGORIES = [
  ['ACCOUNT', 'My account or sign-in'],
  ['BOOKING', 'A booking or appointment'],
  ['BILLING', 'Wallet, leads or billing'],
  ['VERIFICATION', 'Verification of a dentist or clinic'],
  ['DATA_PRIVACY', 'My data and privacy'],
  ['LISTING', 'A listing that is wrong or not mine'],
  ['OTHER', 'Something else'],
] as const;
export const STATUS_LABEL: Record<SupportTicketStatus, string> = { OPEN: 'Open', WAITING_ON_USER: 'Waiting for you', RESOLVED: 'Resolved', CLOSED: 'Closed' };

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

function staff(principal: Principal): AuthenticatedPrincipal {
  const me = signedIn(principal);
  if (!can(me, WORK)) throw errors.forbidden(WORK);
  return me;
}

const body = z.string().trim().min(10, 'Describe it in at least 10 characters.').max(5000);
export const ticketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES.map(([k]) => k) as [string, ...string[]]),
  subject: z.string().trim().min(5, 'Give it a short title.').max(160),
  body,
  organizationId: z.string().max(64).optional(),
});

const HOUR = 3_600_000;

/**
 * The active enterprise agreement covering an organization: its own (it is
 * the group), or its group's. Ends at the end of the agreement's last day.
 */
export async function agreementCovering(organizationId: string, now: Date = new Date()) {
  const organization = await db().organization.findUnique({ where: { id: organizationId }, select: { id: true, parentOrganizationId: true } });
  if (!organization) return null;
  const groups = [organization.id, ...(organization.parentOrganizationId ? [organization.parentOrganizationId] : [])];
  return db().enterpriseAgreement.findFirst({
    where: { organizationId: { in: groups }, status: 'ACTIVE', startsOn: { lte: now }, endsOn: { gt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, organizationId: true, firstResponseHours: true, resolutionHours: true },
  });
}

/** A current Prime period with priority support, for the person or the organization the ticket is about. */
async function hasPrioritySupport(userId: string, organizationId: string | null, now: Date): Promise<boolean> {
  const count = await db().membership.count({
    where: {
      status: 'ACTIVE',
      startsAt: { lte: now },
      endsAt: { gt: now },
      plan: { prioritySupport: true },
      OR: [{ userId }, ...(organizationId ? [{ organizationId }] : [])],
    },
  });
  return count > 0;
}

export async function openTicket(principal: Principal, raw: z.input<typeof ticketSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = ticketSchema.parse(raw);
  const now = context.now ?? new Date();
  if (input.organizationId && (await db().organizationMember.count({ where: { organizationId: input.organizationId, userId: me.userId, leftAt: null } })) === 0) {
    throw errors.validation('Choose an organization you belong to.', { field: 'organizationId' });
  }
  if ((await db().supportTicket.count({ where: { requesterUserId: me.userId, createdAt: { gte: new Date(now.getTime() - DAY) } } })) >= TICKETS_PER_DAY) throw errors.rateLimited(3600);
  const id = newId('supportTicket');
  const priority = await hasPrioritySupport(me.userId, input.organizationId ?? null, now);
  // Under an enterprise agreement the committed service levels are fixed now.
  const agreement = input.organizationId ? await agreementCovering(input.organizationId, now) : null;
  const sla = agreement
    ? { enterpriseAgreementId: agreement.id, slaFirstResponseDueAt: new Date(now.getTime() + agreement.firstResponseHours * HOUR), slaResolveDueAt: new Date(now.getTime() + agreement.resolutionHours * HOUR) }
    : {};
  await transaction(async (tx) => {
    await tx.supportTicket.create({ data: { id, requesterUserId: me.userId, organizationId: input.organizationId ?? null, category: input.category as never, subject: input.subject, lastActivityAt: now, priority, ...sla } });
    await tx.supportMessage.create({ data: { id: newId('supportMessage'), ticketId: id, authorUserId: me.userId, fromStaff: false, body: input.body, createdAt: now } });
  });
  await recordAuditEvent({ action: 'SUPPORT_TICKET_OPENED', actor: me.userId, subject: id, outcome: 'success', organizationId: input.organizationId, requestId: context.requestId, detail: { category: input.category } });
  return { ticketId: id };
}

export const replySchema = z.object({ body, internal: z.boolean().default(false) });

export async function replyToTicket(principal: Principal, ticketId: string, raw: z.input<typeof replySchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = replySchema.parse(raw);
  const now = context.now ?? new Date();
  const ticket = await db().supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw errors.notFound('Ticket');
  const isStaff = can(me, WORK);
  const isRequester = ticket.requesterUserId === me.userId;
  if (!isStaff && !isRequester) throw errors.notFound('Ticket');
  if (input.internal && !isStaff) throw errors.forbidden(WORK);
  if (ticket.status === 'CLOSED') throw errors.preconditionFailed('This ticket is closed. Open a new one if you still need help.');
  // Staff answering waits for the requester; the requester answering reopens it.
  const status: SupportTicketStatus = input.internal ? ticket.status : isStaff && !isRequester ? 'WAITING_ON_USER' : 'OPEN';
  await transaction(async (tx) => {
    await tx.supportMessage.create({ data: { id: newId('supportMessage'), ticketId, authorUserId: me.userId, fromStaff: isStaff && !isRequester, internal: input.internal, body: input.body, createdAt: now } });
    const firstStaffReply = isStaff && !isRequester && !input.internal && ticket.firstRespondedAt === null;
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status, lastActivityAt: now, ...(status === 'OPEN' ? { resolvedAt: null } : {}), ...(firstStaffReply ? { firstRespondedAt: now } : {}) } });
  });
  await recordAuditEvent({ action: input.internal ? 'SUPPORT_NOTE_ADDED' : 'SUPPORT_TICKET_REPLIED', actor: me.userId, subject: ticketId, outcome: 'success', requestId: context.requestId, detail: { fromStaff: isStaff && !isRequester } });
  if (isStaff && !isRequester && !input.internal) {
    await notifyUser({ userId: ticket.requesterUserId, notificationId: 'TL-NOTIF-SUPPORT-UPDATE-001', data: { summary: `Toothlogy support replied to “${ticket.subject}”.` }, linkUrl: `/help/tickets/${ticketId}` });
  }
}

export const statusSchema = z.object({ status: z.enum(['OPEN', 'RESOLVED', 'CLOSED']) });

/** Staff resolve, close or reopen; the requester may close their own. */
export async function setTicketStatus(principal: Principal, ticketId: string, raw: z.input<typeof statusSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const { status } = statusSchema.parse(raw);
  const ticket = await db().supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw errors.notFound('Ticket');
  const isStaff = can(me, WORK);
  if (!isStaff && !(ticket.requesterUserId === me.userId && status === 'CLOSED')) throw ticket.requesterUserId === me.userId ? errors.forbidden(WORK) : errors.notFound('Ticket');
  if (ticket.status === 'CLOSED') throw errors.preconditionFailed('This ticket is closed.');
  const now = context.now ?? new Date();
  await db().supportTicket.update({ where: { id: ticketId }, data: { status, lastActivityAt: now, resolvedAt: status === 'RESOLVED' ? now : status === 'OPEN' ? null : ticket.resolvedAt } });
  await recordAuditEvent({ action: `SUPPORT_TICKET_${status}`, actor: me.userId, subject: ticketId, outcome: 'success', requestId: context.requestId });
  if (isStaff && ticket.requesterUserId !== me.userId && status === 'RESOLVED') {
    await notifyUser({ userId: ticket.requesterUserId, notificationId: 'TL-NOTIF-SUPPORT-UPDATE-001', data: { summary: `Toothlogy support marked “${ticket.subject}” resolved. Reply if it is not.` }, linkUrl: `/help/tickets/${ticketId}` });
  }
}

/** Users holding a global role that grants support work. */
export async function supportAgents(): Promise<Array<{ userId: string; name: string }>> {
  const now = new Date();
  const rows = await db().roleAssignment.findMany({ where: { organizationId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], user: { status: 'ACTIVE', deletedAt: null } }, select: { userId: true, roleKey: true, user: { select: { displayName: true, email: true } } } });
  const byUser = new Map<string, { roles: string[]; name: string }>();
  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? { roles: [], name: r.user.displayName ?? r.user.email ?? r.userId };
    entry.roles.push(r.roleKey);
    byUser.set(r.userId, entry);
  }
  return [...byUser.entries()].filter(([userId, e]) => can({ kind: 'user', userId, roles: e.roles, organizations: [], sessionId: 'agent-list' }, WORK)).map(([userId, e]) => ({ userId, name: e.name }));
}

export const assignSchema = z.object({ assignedToUserId: z.string().max(64).nullable() });

export async function assignTicket(principal: Principal, ticketId: string, raw: z.input<typeof assignSchema>, context: { requestId?: string } = {}) {
  const me = staff(principal);
  const { assignedToUserId } = assignSchema.parse(raw);
  if (assignedToUserId && !(await supportAgents()).some((a) => a.userId === assignedToUserId)) throw errors.validation('That person is not on the support team.', { field: 'assignedToUserId' });
  const done = await db().supportTicket.updateMany({ where: { id: ticketId }, data: { assignedToUserId } });
  if (done.count === 0) throw errors.notFound('Ticket');
  await recordAuditEvent({ action: 'SUPPORT_TICKET_ASSIGNED', actor: me.userId, subject: ticketId, outcome: 'success', requestId: context.requestId, detail: { assignedToUserId } });
}

/** One ticket; the requester never sees internal notes. */
export async function getTicket(principal: Principal, ticketId: string) {
  const me = signedIn(principal);
  const isStaff = can(me, WORK);
  const ticket = await db().supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      requester: { select: { displayName: true, email: true } },
      organization: { select: { name: true } },
      assignedTo: { select: { displayName: true } },
      messages: { where: isStaff ? {} : { internal: false }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!ticket || (!isStaff && ticket.requesterUserId !== me.userId)) throw errors.notFound('Ticket');
  return { ticket, isStaff };
}

export async function myTickets(principal: Principal) {
  const me = signedIn(principal);
  return db().supportTicket.findMany({ where: { requesterUserId: me.userId }, orderBy: { lastActivityAt: 'desc' }, take: 100 });
}

export async function supportQueue(principal: Principal, filter: { status?: SupportTicketStatus; mine?: boolean } = {}) {
  const me = staff(principal);
  return db().supportTicket.findMany({
    where: { ...(filter.status ? { status: filter.status } : { status: { in: ['OPEN', 'WAITING_ON_USER'] } }), ...(filter.mine ? { assignedToUserId: me.userId } : {}) },
    include: { requester: { select: { displayName: true, email: true } }, assignedTo: { select: { displayName: true } }, _count: { select: { messages: true } } },
    // Prime priority support first, then the soonest service-level deadline, then waiting longest.
    orderBy: [{ priority: 'desc' }, { slaFirstResponseDueAt: { sort: 'asc', nulls: 'last' } }, { status: 'asc' }, { lastActivityAt: 'asc' }],
    take: 300,
  });
}
