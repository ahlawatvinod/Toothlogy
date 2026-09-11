/**
 * TOOTHLOGY OPERATIONS — outreach
 *
 * Toothlogy's own team reaching the dentists, clinics, hospitals and colleges
 * of a district: inviting a pre-made dentist to activate, a listing's owner to
 * claim it, checking details that did not parse, helping a practice stay.
 *
 * - A task has exactly one subject (an extracted record or an organization)
 *   and a subject has at most one open task — held by a unique `openKey`
 *   rather than application checks, so two operators cannot both open one.
 * - Operators see unassigned tasks and their own; logging work on an
 *   unassigned task claims it. Leads create, assign, reassign and cancel.
 * - Every call, message, visit and note is an append-only activity.
 * - An activation invitation goes through the real activation flow, and is
 *   refused while email and SMS are not configured — never faked.
 * - Nothing here sends marketing to extracted contacts: they never consented.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { emailProvider, smsProvider } from '../notifications/ports';
import { startActivation } from '../india-data/activation';

export const WORK = 'tl.ops.outreach.work';
export const MANAGE = 'tl.ops.outreach.manage';

const PURPOSES = ['ACTIVATE_ACCOUNT', 'CLAIM_LISTING', 'VERIFY_DETAILS', 'RETENTION'] as const;
const OUTCOMES = ['CONNECTED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'INTERESTED', 'NOT_INTERESTED', 'ONBOARDED'] as const;
const ACTIVITY_TYPES = ['CALL', 'NOTE', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT'] as const;
export const PURPOSE_LABEL: Record<(typeof PURPOSES)[number], string> = {
  ACTIVATE_ACCOUNT: 'Invite to activate',
  CLAIM_LISTING: 'Invite to claim',
  VERIFY_DETAILS: 'Check details',
  RETENTION: 'Practice success',
};

function worker(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal) || !can(principal, WORK)) throw errors.forbidden(WORK);
  return principal;
}

function manager(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal) || !can(principal, MANAGE)) throw errors.forbidden(MANAGE);
  return principal;
}

/** Users holding a global role that grants outreach work, by name. */
export async function listOperationsAgents(): Promise<Array<{ userId: string; name: string }>> {
  const now = new Date();
  const rows = await db().roleAssignment.findMany({
    where: { organizationId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], user: { status: 'ACTIVE', deletedAt: null } },
    select: { userId: true, roleKey: true, user: { select: { displayName: true, email: true } } },
  });
  const byUser = new Map<string, { roles: string[]; name: string }>();
  for (const r of rows) {
    const entry = byUser.get(r.userId) ?? { roles: [], name: r.user.displayName ?? r.user.email ?? r.userId };
    entry.roles.push(r.roleKey);
    byUser.set(r.userId, entry);
  }
  return [...byUser.entries()]
    .filter(([userId, e]) => can({ kind: 'user', userId, roles: e.roles, organizations: [], sessionId: 'agent-list' }, WORK))
    .map(([userId, e]) => ({ userId, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function assertAgent(userId: string): Promise<void> {
  const agents = await listOperationsAgents();
  if (!agents.some((a) => a.userId === userId)) throw errors.validation('That person is not on the operations team.', { field: 'assignedToUserId' });
}

const isoDate = z.string().datetime({ offset: true });

export const createOutreachSchema = z
  .object({
    extractedRecordId: z.string().max(64).optional(),
    organizationId: z.string().max(64).optional(),
    purpose: z.enum(PURPOSES),
    title: z.string().trim().min(3).max(160).optional(),
    assignedToUserId: z.string().max(64).optional(),
    dueAt: isoDate.optional(),
    priority: z.number().int().min(0).max(3).default(0),
  })
  .refine((v) => Boolean(v.extractedRecordId) !== Boolean(v.organizationId), { message: 'Choose one extracted record or one organization.', path: ['extractedRecordId'] });

/** What a task is about, and whether this purpose makes sense for it. */
async function resolveSubject(input: { extractedRecordId?: string; organizationId?: string; purpose: (typeof PURPOSES)[number] }) {
  if (input.extractedRecordId) {
    const record = await db().extractedRecord.findUnique({ where: { id: input.extractedRecordId }, select: { id: true, name: true, entityType: true, status: true, districtId: true } });
    if (!record) throw errors.notFound('Record');
    const fits =
      (input.purpose === 'ACTIVATE_ACCOUNT' && record.entityType === 'DENTIST' && record.status === 'ACCOUNT_CREATED') ||
      (input.purpose === 'CLAIM_LISTING' && record.entityType !== 'DENTIST' && record.status === 'ACCOUNT_CREATED') ||
      (input.purpose === 'VERIFY_DETAILS' && record.status === 'NEW');
    if (!fits) throw errors.preconditionFailed(`“${PURPOSE_LABEL[input.purpose]}” does not apply to a ${record.status.toLowerCase().replace('_', ' ')} ${record.entityType.toLowerCase()} record.`);
    return { extractedRecordId: record.id, organizationId: null, districtId: record.districtId, name: record.name, openKey: `record:${record.id}` };
  }
  const organization = await db().organization.findFirst({
    where: { id: input.organizationId, deletedAt: null },
    select: { id: true, name: true, ownerUserId: true, locations: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' }, take: 1, select: { districtId: true } } },
  });
  if (!organization) throw errors.notFound('Organization');
  const fits = (input.purpose === 'CLAIM_LISTING' && organization.ownerUserId === null) || (input.purpose === 'RETENTION' && organization.ownerUserId !== null) || input.purpose === 'VERIFY_DETAILS';
  if (!fits) throw errors.preconditionFailed(`“${PURPOSE_LABEL[input.purpose]}” does not apply to this organization.`);
  return { extractedRecordId: null, organizationId: organization.id, districtId: organization.locations[0]?.districtId ?? null, name: organization.name, openKey: `organization:${organization.id}` };
}

const openConflict = () => errors.conflict('This already has an open outreach task.');

export async function createOutreachTask(principal: Principal, raw: z.input<typeof createOutreachSchema>, context: { requestId?: string } = {}) {
  const actor = manager(principal).userId;
  const input = createOutreachSchema.parse(raw);
  const subject = await resolveSubject(input);
  if (input.assignedToUserId) await assertAgent(input.assignedToUserId);
  const id = newId('outreachTask');
  try {
    await db().outreachTask.create({
      data: {
        id,
        districtId: subject.districtId,
        extractedRecordId: subject.extractedRecordId,
        organizationId: subject.organizationId,
        purpose: input.purpose,
        title: input.title ?? `${PURPOSE_LABEL[input.purpose]}: ${subject.name}`,
        priority: input.priority,
        openKey: subject.openKey,
        assignedToUserId: input.assignedToUserId ?? null,
        assignedAt: input.assignedToUserId ? new Date() : null,
        createdByUserId: actor,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw openConflict();
    throw error;
  }
  await recordAuditEvent({ action: 'OUTREACH_TASK_CREATED', actor, subject: id, outcome: 'success', requestId: context.requestId, detail: { purpose: input.purpose } });
  return { taskId: id };
}

export const bulkOutreachSchema = z.object({
  districtId: z.string().max(64),
  purpose: z.enum(PURPOSES),
  assigneeUserIds: z.array(z.string().max(64)).max(20).default([]),
  dueAt: isoDate.optional(),
  limit: z.number().int().min(1).max(500).default(100),
});

/**
 * Open a task for every subject in a district that this purpose applies to
 * and that has no open task, shared round-robin between the chosen agents.
 */
export async function bulkCreateOutreach(principal: Principal, raw: z.input<typeof bulkOutreachSchema>, context: { requestId?: string } = {}) {
  const actor = manager(principal).userId;
  const input = bulkOutreachSchema.parse(raw);
  if (!(await db().district.findUnique({ where: { id: input.districtId }, select: { id: true } }))) throw errors.validation('That district does not exist.', { field: 'districtId' });
  for (const userId of new Set(input.assigneeUserIds)) await assertAgent(userId);
  const noOpenTask = { outreachTasks: { none: { status: 'OPEN' as const } } };

  const subjects: Array<{ extractedRecordId: string | null; organizationId: string | null; name: string; openKey: string }> =
    input.purpose === 'RETENTION'
      ? (
          await db().organization.findMany({
            where: { deletedAt: null, ownerUserId: { not: null }, status: 'ACTIVE', locations: { some: { districtId: input.districtId, deletedAt: null } }, ...noOpenTask },
            select: { id: true, name: true },
            orderBy: { createdAt: 'asc' },
            take: input.limit,
          })
        ).map((o) => ({ extractedRecordId: null, organizationId: o.id, name: o.name, openKey: `organization:${o.id}` }))
      : (
          await db().extractedRecord.findMany({
            where: {
              districtId: input.districtId,
              ...noOpenTask,
              ...(input.purpose === 'ACTIVATE_ACCOUNT'
                ? { entityType: 'DENTIST', status: 'ACCOUNT_CREATED' }
                : input.purpose === 'CLAIM_LISTING'
                  ? { entityType: { not: 'DENTIST' }, status: 'ACCOUNT_CREATED' }
                  : { status: 'NEW', confidence: { lt: 60 } }),
            },
            select: { id: true, name: true },
            orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }],
            take: input.limit,
          })
        ).map((r) => ({ extractedRecordId: r.id, organizationId: null, name: r.name, openKey: `record:${r.id}` }));

  const now = new Date();
  const agents = [...new Set(input.assigneeUserIds)];
  const result = await db().outreachTask.createMany({
    data: subjects.map((s, i) => ({
      id: newId('outreachTask'),
      districtId: input.districtId,
      extractedRecordId: s.extractedRecordId,
      organizationId: s.organizationId,
      purpose: input.purpose,
      title: `${PURPOSE_LABEL[input.purpose]}: ${s.name}`,
      openKey: s.openKey,
      assignedToUserId: agents.length ? agents[i % agents.length]! : null,
      assignedAt: agents.length ? now : null,
      createdByUserId: actor,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    })),
    // A subject that gained an open task since the query is skipped, not doubled.
    skipDuplicates: true,
  });
  await recordAuditEvent({ action: 'OUTREACH_BULK_CREATED', actor, subject: input.districtId, outcome: 'success', requestId: context.requestId, detail: { purpose: input.purpose, candidates: subjects.length, created: result.count, agents: agents.length } });
  return { candidates: subjects.length, created: result.count };
}

export async function listOutreachTasks(principal: Principal, filter: { districtId?: string; status?: 'OPEN' | 'DONE' | 'CANCELLED'; scope?: 'mine' | 'unassigned' | 'all'; overdue?: boolean } = {}, now: Date = new Date()) {
  const me = worker(principal);
  const scope = filter.scope ?? 'mine';
  const everyone = scope === 'all' && can(me, MANAGE);
  const visibility: Prisma.OutreachTaskWhereInput = everyone
    ? {}
    : scope === 'unassigned'
      ? { assignedToUserId: null }
      : scope === 'mine'
        ? { assignedToUserId: me.userId }
        : { OR: [{ assignedToUserId: me.userId }, { assignedToUserId: null }] };
  return db().outreachTask.findMany({
    where: {
      ...visibility,
      status: filter.status ?? 'OPEN',
      ...(filter.districtId ? { districtId: filter.districtId } : {}),
      ...(filter.overdue ? { dueAt: { lt: now } } : {}),
    },
    include: {
      district: { select: { name: true, region: { select: { name: true } } } },
      assignedTo: { select: { displayName: true } },
      extractedRecord: { select: { name: true, entityType: true, status: true, phone: true, email: true, premadeUserId: true, premadeUser: { select: { status: true } } } },
      organization: { select: { name: true, type: true, status: true, phone: true, email: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: [{ priority: 'desc' }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 200,
  });
}

async function openTaskFor(principal: AuthenticatedPrincipal, taskId: string) {
  const task = await db().outreachTask.findUnique({ where: { id: taskId } });
  if (!task) throw errors.notFound('Task');
  if (task.status !== 'OPEN') throw errors.preconditionFailed(`This task is ${task.status.toLowerCase()}.`);
  if (task.assignedToUserId && task.assignedToUserId !== principal.userId && !can(principal, MANAGE)) {
    throw errors.preconditionFailed('This task is assigned to someone else.');
  }
  return task;
}

/** Logging work on an unassigned task takes it, atomically. */
async function claimIfUnassigned(tx: Prisma.TransactionClient, task: { id: string; assignedToUserId: string | null }, userId: string) {
  if (task.assignedToUserId) return;
  const claim = await tx.outreachTask.updateMany({ where: { id: task.id, assignedToUserId: null, status: 'OPEN' }, data: { assignedToUserId: userId, assignedAt: new Date() } });
  if (claim.count === 0) throw errors.conflict('Someone else took this task a moment ago.');
}

export const activitySchema = z
  .object({
    type: z.enum(ACTIVITY_TYPES),
    outcome: z.enum(OUTCOMES).optional(),
    note: z.string().trim().max(2000).optional(),
    nextDueAt: isoDate.optional(),
  })
  .refine((v) => v.type !== 'CALL' || v.outcome, { message: 'Choose how the call went.', path: ['outcome'] })
  .refine((v) => v.type !== 'NOTE' || (v.note && v.note.length >= 2), { message: 'Write a note.', path: ['note'] });

export async function logOutreachActivity(principal: Principal, taskId: string, raw: z.input<typeof activitySchema>, context: { requestId?: string } = {}) {
  const me = worker(principal);
  const input = activitySchema.parse(raw);
  const task = await openTaskFor(me, taskId);
  const activityId = newId('outreachActivity');
  await transaction(async (tx) => {
    await claimIfUnassigned(tx, task, me.userId);
    await tx.outreachActivity.create({ data: { id: activityId, taskId, type: input.type, outcome: input.outcome ?? null, note: input.note ?? null, actorUserId: me.userId } });
    if (input.nextDueAt) await tx.outreachTask.update({ where: { id: taskId }, data: { dueAt: new Date(input.nextDueAt) } });
  });
  await recordAuditEvent({ action: 'OUTREACH_ACTIVITY_LOGGED', actor: me.userId, subject: taskId, outcome: 'success', requestId: context.requestId, detail: { type: input.type, outcome: input.outcome ?? null } });
  return { activityId };
}

export const closeSchema = z.object({
  action: z.enum(['COMPLETE', 'CANCEL']),
  outcome: z.enum(OUTCOMES).optional(),
  note: z.string().trim().max(2000).optional(),
});

export async function closeOutreachTask(principal: Principal, taskId: string, raw: z.input<typeof closeSchema>, context: { requestId?: string } = {}) {
  const me = worker(principal);
  const input = closeSchema.parse(raw);
  if (input.action === 'CANCEL') manager(principal);
  if (input.action === 'COMPLETE' && !input.outcome) throw errors.validation('Choose the outcome.', { field: 'outcome' });
  if (input.action === 'CANCEL' && !input.note) throw errors.validation('Give a reason.', { field: 'note' });
  const task = await openTaskFor(me, taskId);
  const now = new Date();
  await transaction(async (tx) => {
    const closed = await tx.outreachTask.updateMany({
      where: { id: task.id, status: 'OPEN' },
      data: { status: input.action === 'COMPLETE' ? 'DONE' : 'CANCELLED', outcome: input.outcome ?? null, completedAt: now, openKey: null, ...(task.assignedToUserId ? {} : { assignedToUserId: me.userId, assignedAt: now }) },
    });
    if (closed.count === 0) throw errors.conflict('This task changed while you were acting on it.');
    await tx.outreachActivity.create({ data: { id: newId('outreachActivity'), taskId, type: 'NOTE', outcome: input.outcome ?? null, note: `${input.action === 'COMPLETE' ? 'Completed' : 'Cancelled'}${input.note ? `: ${input.note}` : ''}`, actorUserId: me.userId } });
  });
  await recordAuditEvent({ action: input.action === 'COMPLETE' ? 'OUTREACH_TASK_COMPLETED' : 'OUTREACH_TASK_CANCELLED', actor: me.userId, subject: taskId, outcome: 'success', requestId: context.requestId, detail: { outcome: input.outcome ?? null } });
  return { status: input.action === 'COMPLETE' ? 'DONE' : 'CANCELLED' };
}

export const assignSchema = z.object({ assignedToUserId: z.string().max(64).nullable() });

/** Leads assign anyone on the team; an operator may only take an unassigned task. */
export async function assignOutreachTask(principal: Principal, taskId: string, raw: z.input<typeof assignSchema>, context: { requestId?: string } = {}) {
  const me = worker(principal);
  const { assignedToUserId } = assignSchema.parse(raw);
  const task = await db().outreachTask.findUnique({ where: { id: taskId } });
  if (!task) throw errors.notFound('Task');
  if (task.status !== 'OPEN') throw errors.preconditionFailed(`This task is ${task.status.toLowerCase()}.`);
  const selfClaim = assignedToUserId === me.userId && task.assignedToUserId === null;
  if (!selfClaim) manager(principal);
  if (assignedToUserId) await assertAgent(assignedToUserId);
  const updated = await db().outreachTask.updateMany({
    where: { id: taskId, status: 'OPEN', ...(selfClaim ? { assignedToUserId: null } : {}) },
    data: { assignedToUserId, assignedAt: assignedToUserId ? new Date() : null },
  });
  if (updated.count === 0) throw errors.conflict('Someone else took this task a moment ago.');
  await recordAuditEvent({ action: 'OUTREACH_TASK_ASSIGNED', actor: me.userId, subject: taskId, outcome: 'success', requestId: context.requestId, detail: { assignedToUserId } });
  return { assignedToUserId };
}

/**
 * Send a pre-made dentist the activation link and code, through the same
 * flow the dentist would start themselves. Refused while email or SMS is not
 * configured: an invitation that cannot arrive is not recorded as sent.
 */
export async function sendActivationInvite(principal: Principal, taskId: string, context: { requestId?: string } = {}) {
  const me = worker(principal);
  const task = await openTaskFor(me, taskId);
  const record = task.extractedRecordId
    ? await db().extractedRecord.findUnique({ where: { id: task.extractedRecordId }, select: { premadeUser: { select: { email: true, phone: true, status: true } } } })
    : null;
  const user = record?.premadeUser;
  if (!user) throw errors.preconditionFailed('Only a pre-made dentist account can be sent an activation invitation.');
  if (user.status !== 'PENDING_ACTIVATION') throw errors.preconditionFailed('This account is already active.');
  if (!emailProvider.isConfigured() || !smsProvider.isConfigured()) throw errors.notConfigured('email and SMS delivery');
  await startActivation({ email: user.email ?? '', phone: user.phone ?? '' }, { requestId: context.requestId });
  await transaction(async (tx) => {
    await claimIfUnassigned(tx, task, me.userId);
    await tx.outreachActivity.create({ data: { id: newId('outreachActivity'), taskId, type: 'EMAIL', note: 'Activation link sent by email and code by SMS (a code is not resent within a minute of the last).', actorUserId: me.userId } });
  });
  await recordAuditEvent({ action: 'OUTREACH_ACTIVATION_INVITED', actor: me.userId, subject: taskId, outcome: 'success', requestId: context.requestId });
  return { sent: true as const };
}
