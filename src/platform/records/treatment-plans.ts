/**
 * TOOTHLOGY TREATMENT PLANS — proposed by the practice, decided by the patient
 *
 * PROPOSED → ACCEPTED → items DONE or SKIPPED → COMPLETED; or DECLINED; or
 * CANCELLED (withdrawn by the practice, with a reason the patient sees).
 *
 * - A practice proposes, records progress and withdraws only under the
 *   patient's read-and-add grant (tl.records.record.write) — the same rule as
 *   adding to the record. Without a grant a plan, like the record, does not
 *   exist for the practice.
 * - The patient accepts or declines, once.
 * - Part of the patient's record: the patient sees every plan for good,
 *   including after a practice's access ends, and in the personal-data export.
 * - Estimates are tax-inclusive estimates in the practice's currency — never a
 *   bill; Toothlogy takes no payment for treatment.
 * - Notifications say who, never the clinical detail.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { parseTeeth, writeAccess } from './service';

const MAX_ITEMS = 20;

interface Context {
  readonly requestId?: string;
  readonly now?: Date;
}

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0]!;
  throw errors.validation(issue.message, issue.path.length ? { field: issue.path.map(String).join('.') } : undefined);
}

/** "1500" or "1500.50" → 150050 minor units (two decimal places). */
export function toMinor(amount: string): bigint {
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole!) * 100n + BigInt(`${fraction}00`.slice(0, 2));
}

export const planItemSchema = z.object({
  description: z.string().trim().min(2, 'Describe each treatment.').max(200),
  treatmentKey: z.string().trim().max(80).optional(),
  teeth: z.string().max(120).optional(),
  estimate: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an estimate, e.g. 1500 or 1500.50.'),
});

export const planSchema = z.object({
  title: z.string().trim().min(3, 'Give the plan a title.').max(120),
  notes: z.string().trim().max(2000).optional(),
  dependentId: z.string().max(64).optional(),
  items: z.array(planItemSchema).min(1, 'Add at least one treatment.').max(MAX_ITEMS, `A plan has at most ${MAX_ITEMS} treatments.`),
});

export const decisionSchema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']), reason: z.string().trim().max(500).optional() });
export const itemActionSchema = z.object({ status: z.enum(['DONE', 'SKIPPED']), reason: z.string().trim().max(300).optional() });
export const cancelPlanSchema = z.object({ reason: z.string().trim().min(3, 'Say why the plan is withdrawn.').max(500) });

async function practiceName(organizationId: string) {
  return (await db().organization.findUnique({ where: { id: organizationId }, select: { name: true } }))?.name ?? 'A practice';
}

const planInclude = {
  items: { orderBy: { position: 'asc' } },
  organization: { select: { id: true, name: true } },
  dependent: { select: { name: true } },
  author: { select: { displayName: true } },
} as const;

/** Every plan in a patient's record, newest first. */
export function plansFor(patientUserId: string) {
  return db().treatmentPlan.findMany({ where: { patientUserId }, include: planInclude, orderBy: { createdAt: 'desc' }, take: 100 });
}

export type TreatmentPlanView = Awaited<ReturnType<typeof plansFor>>[number];

/** A practice proposes a plan under a grant that allows adding. */
export async function proposePlan(principal: Principal, organizationId: string, patientUserId: string, raw: z.input<typeof planSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(planSchema, raw);
  await writeAccess(me, organizationId, patientUserId);

  if (input.dependentId) {
    const dependent = await db().dependent.findFirst({ where: { id: input.dependentId, guardianUserId: patientUserId, deletedAt: null }, select: { id: true } });
    if (!dependent) throw errors.validation('Choose a family member on this account.', { field: 'dependentId' });
  }
  const keys = [...new Set(input.items.map((i) => i.treatmentKey).filter((k): k is string => Boolean(k)))];
  if (keys.length > 0 && (await db().treatment.count({ where: { key: { in: keys }, isActive: true } })) !== keys.length) {
    throw errors.validation('Choose treatments from the catalogue.', { field: 'items' });
  }
  const items = input.items.map((item, index) => ({
    id: newId('treatmentPlanItem'),
    position: index + 1,
    description: item.description,
    treatmentKey: item.treatmentKey || null,
    teeth: parseTeeth(item.teeth),
    estimateMinor: toMinor(item.estimate),
  }));
  const organization = await db().organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, currency: true } });
  const id = newId('treatmentPlan');
  await db().treatmentPlan.create({
    data: {
      id,
      patientUserId,
      dependentId: input.dependentId ?? null,
      organizationId,
      authorUserId: me.userId,
      title: input.title,
      notes: input.notes || null,
      currency: organization.currency,
      estimateMinor: items.reduce((sum, i) => sum + i.estimateMinor, 0n),
      items: { create: items },
    },
  });
  await recordAuditEvent({ action: 'TREATMENT_PLAN_PROPOSED', actor: me.userId, subject: patientUserId, organizationId, outcome: 'success', requestId: context.requestId, detail: { planId: id, items: items.length } });
  await notifyUser({ userId: patientUserId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001', data: { practice: organization.name, change: 'proposed a treatment plan for you to accept or decline' }, linkUrl: '/account/records', requestId: context.requestId });
  return { planId: id };
}

/** The patient accepts or declines, once. */
export async function decidePlan(principal: Principal, planId: string, raw: z.input<typeof decisionSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(decisionSchema, raw);
  const plan = await db().treatmentPlan.findUnique({ where: { id: planId }, select: { patientUserId: true, organizationId: true } });
  if (!plan || plan.patientUserId !== me.userId) throw errors.notFound('Treatment plan');
  const now = context.now ?? new Date();
  const accept = input.decision === 'ACCEPT';
  const decided = await db().treatmentPlan.updateMany({
    where: { id: planId, status: 'PROPOSED' },
    data: accept ? { status: 'ACCEPTED', decidedAt: now } : { status: 'DECLINED', decidedAt: now, declineReason: input.reason || null },
  });
  if (decided.count === 0) throw errors.conflict('This plan has already been decided or withdrawn.');
  await recordAuditEvent({ action: 'TREATMENT_PLAN_DECIDED', actor: me.userId, subject: planId, organizationId: plan.organizationId, outcome: 'success', requestId: context.requestId, detail: { decision: input.decision } });
  const patient = (await db().user.findUnique({ where: { id: me.userId }, select: { displayName: true } }))?.displayName ?? 'A patient';
  await notifyOrganizationAdmins({ organizationId: plan.organizationId, notificationId: 'TL-NOTIF-TREATMENT-PLAN-001', data: { patient, change: accept ? 'accepted' : 'declined' }, linkUrl: `/account/organizations/${plan.organizationId}/patients/${me.userId}` });
  return { status: accept ? ('ACCEPTED' as const) : ('DECLINED' as const) };
}

async function practicePlan(me: AuthenticatedPrincipal, planId: string) {
  const plan = await db().treatmentPlan.findUnique({ where: { id: planId }, select: { id: true, organizationId: true, patientUserId: true, status: true } });
  if (!plan) throw errors.notFound('Treatment plan');
  // Not found without a read-and-add grant: the plan belongs to the record.
  await writeAccess(me, plan.organizationId, plan.patientUserId);
  return plan;
}

/** The practice records one treatment as done, or not done with a reason. */
export async function actOnPlanItem(principal: Principal, planId: string, itemId: string, raw: z.input<typeof itemActionSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(itemActionSchema, raw);
  if (input.status === 'SKIPPED' && !input.reason) throw errors.validation('Say why it was not done.', { field: 'reason' });
  const plan = await practicePlan(me, planId);
  if (plan.status !== 'ACCEPTED') throw errors.preconditionFailed('Progress is recorded on a plan the patient has accepted.');
  const now = context.now ?? new Date();
  const result = await transaction(async (tx) => {
    // One writer per plan at a time, so the last two items cannot both miss completion.
    await tx.$queryRaw`SELECT "id" FROM "treatment_plans" WHERE "id" = ${planId} FOR UPDATE`;
    const updated = await tx.treatmentPlanItem.updateMany({
      where: { id: itemId, planId, status: 'PLANNED' },
      data: { status: input.status, doneAt: input.status === 'DONE' ? now : null, doneByUserId: me.userId, skipReason: input.status === 'SKIPPED' ? input.reason! : null },
    });
    if (updated.count === 0) throw errors.conflict('This treatment has already been recorded.');
    const left = await tx.treatmentPlanItem.count({ where: { planId, status: 'PLANNED' } });
    if (left === 0) await tx.treatmentPlan.updateMany({ where: { id: planId, status: 'ACCEPTED' }, data: { status: 'COMPLETED', completedAt: now } });
    return { completed: left === 0 };
  });
  await recordAuditEvent({ action: 'TREATMENT_PLAN_UPDATED', actor: me.userId, subject: plan.patientUserId, organizationId: plan.organizationId, outcome: 'success', requestId: context.requestId, detail: { planId, itemId, status: input.status } });
  await notifyUser({ userId: plan.patientUserId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001', data: { practice: await practiceName(plan.organizationId), change: result.completed ? 'completed a treatment plan' : 'recorded progress on a treatment plan' }, linkUrl: '/account/records', requestId: context.requestId });
  return result;
}

/** The practice withdraws a proposed or accepted plan, with a reason the patient sees. */
export async function cancelPlan(principal: Principal, planId: string, raw: z.input<typeof cancelPlanSchema>, context: Context = {}) {
  const me = signedIn(principal);
  const input = parse(cancelPlanSchema, raw);
  const plan = await practicePlan(me, planId);
  const cancelled = await db().treatmentPlan.updateMany({ where: { id: planId, status: { in: ['PROPOSED', 'ACCEPTED'] } }, data: { status: 'CANCELLED', cancelledAt: context.now ?? new Date(), cancelledReason: input.reason } });
  if (cancelled.count === 0) throw errors.conflict('Only a proposed or accepted plan can be withdrawn.');
  await recordAuditEvent({ action: 'TREATMENT_PLAN_CANCELLED', actor: me.userId, subject: plan.patientUserId, organizationId: plan.organizationId, outcome: 'success', requestId: context.requestId, detail: { planId } });
  await notifyUser({ userId: plan.patientUserId, notificationId: 'TL-NOTIF-RECORD-UPDATED-001', data: { practice: await practiceName(plan.organizationId), change: 'withdrew a treatment plan' }, linkUrl: '/account/records', requestId: context.requestId });
}
