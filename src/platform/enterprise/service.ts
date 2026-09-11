/**
 * TOOTHLOGY ENTERPRISE — groups, agreements, service levels, data residency
 *
 * GROUP: an organization with member organizations under it, one level deep
 * (a chain and its clinics). AGREEMENT: recorded by staff from the signed
 * contract — its term, the support service levels Toothlogy committed to
 * (first response and resolution, in hours), where the group's data must be
 * held, and whether its people must sign in through the group's identity
 * provider. One current agreement per group.
 *
 * - Service levels are stamped on every support ticket from a covered
 *   organization when it opens (support/service.ts), and measured against the
 *   first staff reply and the resolution: met, breached or still running.
 * - Data residency is a hosting commitment. Toothlogy states where it runs
 *   only from deployment configuration (TOOTHLOGY_HOSTING_REGION); when that is
 *   undeclared or different, the agreement shows the commitment as not met.
 * - Single sign-on goes through the SSO port, NOT_CONFIGURED until a provider
 *   is connected; a contract that requires it shows that it is not yet met.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { ssoProvider } from '../auth/sso-ports';

export const ENTERPRISE_MANAGE = 'tl.admin.enterprise.manage';
const READ = 'tl.enterprise.agreement.read';

const dateText = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

function staff(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  if (!can(principal, ENTERPRISE_MANAGE)) throw errors.forbidden(ENTERPRISE_MANAGE);
  return principal;
}

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw errors.validation(issue?.message ?? 'Check the details and try again.', issue?.path.length ? { field: issue.path.map(String).join('.') } : undefined);
  }
  return result.data;
}

const day = z
  .union([
    z.date(),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
      .transform((s) => new Date(`${s}T00:00:00Z`)),
  ])
  .refine((d) => !Number.isNaN(d.getTime()), 'Enter a real date.');

/** Where Toothlogy is hosted, as the deployment declares it; null when undeclared. */
export function hostingRegion(): string | null {
  const value = process.env.TOOTHLOGY_HOSTING_REGION?.trim().toUpperCase();
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

export type SlaOutcome = 'MET' | 'BREACHED' | 'RUNNING';

/** One deadline: done in time, done late or not done after it (breached), or still running. */
export function slaOutcome(due: Date, doneAt: Date | null, now: Date): SlaOutcome {
  if (doneAt) return doneAt.getTime() <= due.getTime() ? 'MET' : 'BREACHED';
  return now.getTime() > due.getTime() ? 'BREACHED' : 'RUNNING';
}

async function slaReport(agreementId: string, now: Date) {
  const tickets = await db().supportTicket.findMany({ where: { enterpriseAgreementId: agreementId }, select: { slaFirstResponseDueAt: true, slaResolveDueAt: true, firstRespondedAt: true, resolvedAt: true } });
  const tally = () => ({ MET: 0, BREACHED: 0, RUNNING: 0 });
  const firstResponse = tally();
  const resolution = tally();
  for (const t of tickets) {
    if (t.slaFirstResponseDueAt) firstResponse[slaOutcome(t.slaFirstResponseDueAt, t.firstRespondedAt, now)] += 1;
    if (t.slaResolveDueAt) resolution[slaOutcome(t.slaResolveDueAt, t.resolvedAt, now)] += 1;
  }
  return { tickets: tickets.length, firstResponse, resolution };
}

async function describe(agreement: Prisma.EnterpriseAgreementGetPayload<object>, now: Date) {
  const hosted = hostingRegion();
  return {
    ...agreement,
    residency: { required: agreement.dataResidency, hosted, met: hosted === agreement.dataResidency },
    sso: { required: agreement.ssoRequired, connected: ssoProvider.isConfigured() },
    sla: await slaReport(agreement.id, now),
  };
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const agreementSchema = z.object({
  organizationId: z.string().min(1, 'Choose the group.').max(64),
  reference: z.string().trim().min(3, 'Enter the contract reference.').max(60),
  startsOn: day,
  endsOn: day,
  firstResponseHours: z.number().int().min(1).max(168),
  resolutionHours: z.number().int().min(1).max(2160),
  dataResidency: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Enter a two-letter country code.'),
  ssoRequired: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function recordAgreement(principal: Principal, raw: z.input<typeof agreementSchema>, context: { requestId?: string } = {}) {
  const me = staff(principal);
  const input = parse(agreementSchema, raw);
  if (input.endsOn <= input.startsOn) throw errors.validation('The agreement must end after it starts.', { field: 'endsOn' });
  if (input.resolutionHours < input.firstResponseHours) throw errors.validation('Resolution cannot be due before the first response.', { field: 'resolutionHours' });
  if (!(await db().country.findUnique({ where: { code: input.dataResidency }, select: { code: true } }))) throw errors.validation('That country is not modelled.', { field: 'dataResidency' });
  const group = await db().organization.findFirst({ where: { id: input.organizationId, deletedAt: null }, select: { id: true, name: true, parentOrganizationId: true } });
  if (!group) throw errors.notFound('Organization');
  if (group.parentOrganizationId) throw errors.preconditionFailed('This organization belongs to a group. Record the agreement with the group.');
  const id = newId('enterpriseAgreement');
  try {
    await db().enterpriseAgreement.create({
      data: {
        id,
        organizationId: group.id,
        reference: input.reference,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        firstResponseHours: input.firstResponseHours,
        resolutionHours: input.resolutionHours,
        dataResidency: input.dataResidency,
        ssoRequired: input.ssoRequired ?? false,
        notes: input.notes || null,
        openKey: `group:${group.id}`,
        createdByUserId: me.userId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This group already has a current agreement. End it before recording another.');
    throw error;
  }
  await recordAuditEvent({ action: 'ENTERPRISE_AGREEMENT_RECORDED', actor: me.userId, subject: id, outcome: 'success', organizationId: group.id, requestId: context.requestId, detail: { reference: input.reference, firstResponseHours: input.firstResponseHours, resolutionHours: input.resolutionHours, dataResidency: input.dataResidency } });
  await notifyOrganizationAdmins({
    organizationId: group.id,
    notificationId: 'TL-NOTIF-ENTERPRISE-001',
    data: { summary: `Your enterprise agreement ${input.reference} is recorded: ${dateText(input.startsOn)} to ${dateText(input.endsOn)}, first response within ${input.firstResponseHours} hours, resolution within ${input.resolutionHours} hours.` },
    linkUrl: `/account/organizations/${group.id}/enterprise`,
  });
  return { agreementId: id };
}

export const endSchema = z.object({ reason: z.string().trim().min(3, 'Say why.').max(500) });

export async function endAgreement(principal: Principal, agreementId: string, raw: z.input<typeof endSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = staff(principal);
  const { reason } = parse(endSchema, raw);
  const now = context.now ?? new Date();
  const claim = await db().enterpriseAgreement.updateMany({ where: { id: agreementId, status: 'ACTIVE' }, data: { status: 'ENDED', openKey: null, endedAt: now, endedReason: reason } });
  if (claim.count === 0) throw (await db().enterpriseAgreement.count({ where: { id: agreementId } })) ? errors.preconditionFailed('This agreement has already ended.') : errors.notFound('Agreement');
  const agreement = await db().enterpriseAgreement.findUniqueOrThrow({ where: { id: agreementId } });
  await recordAuditEvent({ action: 'ENTERPRISE_AGREEMENT_ENDED', actor: me.userId, subject: agreementId, outcome: 'success', organizationId: agreement.organizationId, requestId: context.requestId, detail: { reason } });
  await notifyOrganizationAdmins({ organizationId: agreement.organizationId, notificationId: 'TL-NOTIF-ENTERPRISE-001', data: { summary: `Your enterprise agreement ${agreement.reference} has ended: ${reason}` }, linkUrl: `/account/organizations/${agreement.organizationId}/enterprise` });
  return { status: 'ENDED' as const };
}

export const membershipSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('LINK'), groupOrganizationId: z.string().min(1).max(64), memberOrganizationId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Say why.').max(500) }),
  z.object({ action: z.literal('UNLINK'), memberOrganizationId: z.string().min(1).max(64), reason: z.string().trim().min(3, 'Say why.').max(500) }),
]);

/** Put an organization under a group, or take it out. One level deep: a group has no group, a member has no members. */
export async function setGroupMembership(principal: Principal, raw: z.input<typeof membershipSchema>, context: { requestId?: string } = {}) {
  const me = staff(principal);
  const input = parse(membershipSchema, raw);
  const member = await db().organization.findFirst({ where: { id: input.memberOrganizationId, deletedAt: null }, select: { id: true, name: true, parentOrganizationId: true, _count: { select: { children: true } } } });
  if (!member) throw errors.notFound('Organization');
  if (input.action === 'UNLINK') {
    if (!member.parentOrganizationId) throw errors.preconditionFailed(`${member.name} is not in a group.`);
    const group = member.parentOrganizationId;
    await db().organization.update({ where: { id: member.id }, data: { parentOrganizationId: null } });
    await recordAuditEvent({ action: 'ENTERPRISE_MEMBER_UNLINKED', actor: me.userId, subject: member.id, outcome: 'success', organizationId: group, requestId: context.requestId, detail: { reason: input.reason } });
    for (const organizationId of [group, member.id]) {
      await notifyOrganizationAdmins({ organizationId, notificationId: 'TL-NOTIF-ENTERPRISE-001', data: { summary: `${member.name} is no longer part of the group: ${input.reason}` }, linkUrl: `/account/organizations/${organizationId}` });
    }
    return { memberOrganizationId: member.id, groupOrganizationId: null };
  }
  if (input.groupOrganizationId === member.id) throw errors.validation('An organization cannot be its own group.', { field: 'groupOrganizationId' });
  const group = await db().organization.findFirst({ where: { id: input.groupOrganizationId, deletedAt: null }, select: { id: true, name: true, parentOrganizationId: true } });
  if (!group) throw errors.notFound('Group');
  if (group.parentOrganizationId) throw errors.preconditionFailed(`${group.name} is itself part of a group; groups are one level deep.`);
  if (member.parentOrganizationId) throw errors.preconditionFailed(`${member.name} is already part of a group. Take it out first.`);
  if (member._count.children > 0) throw errors.preconditionFailed(`${member.name} is a group itself; groups are one level deep.`);
  await db().organization.update({ where: { id: member.id }, data: { parentOrganizationId: group.id } });
  await recordAuditEvent({ action: 'ENTERPRISE_MEMBER_LINKED', actor: me.userId, subject: member.id, outcome: 'success', organizationId: group.id, requestId: context.requestId, detail: { reason: input.reason } });
  for (const organizationId of [group.id, member.id]) {
    await notifyOrganizationAdmins({ organizationId, notificationId: 'TL-NOTIF-ENTERPRISE-001', data: { summary: `${member.name} is now part of ${group.name}. Support requests from it follow the group’s agreement.` }, linkUrl: `/account/organizations/${organizationId}` });
  }
  return { memberOrganizationId: member.id, groupOrganizationId: group.id };
}

export async function enterpriseAdmin(principal: Principal, now: Date = new Date()) {
  staff(principal);
  const agreements = await db().enterpriseAgreement.findMany({ orderBy: [{ status: 'asc' }, { endsOn: 'asc' }], include: { organization: { select: { name: true, _count: { select: { children: true } } } } }, take: 200 });
  return Promise.all(agreements.map(async (a) => ({ ...(await describe(a, now)), group: { name: a.organization.name, members: a.organization._count.children } })));
}

// ---------------------------------------------------------------------------
// The group's own view
// ---------------------------------------------------------------------------

export async function groupConsole(principal: Principal, organizationId: string, now: Date = new Date()) {
  if (!isAuthenticated(principal) || !can(principal, READ, { organizationId })) throw errors.notFound('Organization');
  const organization = await db().organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, name: true, parent: { select: { id: true, name: true } }, children: { where: { deletedAt: null }, select: { id: true, name: true, type: true }, orderBy: { name: 'asc' } } },
  });
  if (!organization) throw errors.notFound('Organization');
  const groupId = organization.parent?.id ?? organization.id;
  const agreement = await db().enterpriseAgreement.findFirst({ where: { organizationId: groupId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  return { organization, groupId, agreement: agreement ? await describe(agreement, now) : null };
}
