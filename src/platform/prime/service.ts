/**
 * TOOTHLOGY PRIME — membership plans, periods and entitlements
 *
 * PLAN (staff: draft → active → retired; its price, period and benefits are
 * configuration, never code) → an organization BUYS a period from its lead
 * wallet (net plus tax, one ledger entry) → ACTIVE until its end → RENEWS from
 * the wallet when auto-renew is on and the wallet covers it; otherwise ENDS.
 *
 * Entitlements:
 * - bonus free leads in each paid period, applied by lead billing after the
 *   standard allowance (billing/service.ts);
 * - a labelled "Prime member" badge on public pages — ranking never reads it
 *   (Constitution P3);
 * - priority in the support queue.
 *
 * Plans for individuals need a payment provider: buying one goes to the
 * payment port, which answers NOT_CONFIGURED until a provider is connected.
 * No refunds for a period part-used; turning auto-renew off keeps the period
 * to its end.
 */

import { z } from 'zod';
import { Prisma, type MembershipPlanStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { formatMoney } from '../money';
import { requireTaxRate, taxOn, type TaxCategory } from '../tax';
import { chargeMembership } from '../billing/service';
import { paymentProvider } from '../payments/ports';

const PLAN_MANAGE = 'tl.prime.plan.manage';
const MEMBERSHIP_MANAGE = 'tl.prime.membership.manage';
const PERIODS = [1, 3, 6, 12, 24] as const;

export const PLAN_STATUS_LABEL: Record<MembershipPlanStatus, string> = { DRAFT: 'Draft', ACTIVE: 'On sale', RETIRED: 'Retired' };

const money = (amountMinor: bigint, currency: string) => formatMoney({ amountMinor, currency }, 'en-IN');
const dateText = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

/** Add whole calendar months, keeping the day where the month allows (31 Jan + 1 → 28/29 Feb). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw errors.validation(issue?.message ?? 'Check the details and try again.', issue?.path.length ? { field: issue.path.map(String).join('.') } : undefined);
  }
  return result.data;
}

function staff(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  if (!can(principal, PLAN_MANAGE)) throw errors.forbidden(PLAN_MANAGE);
  return principal;
}

const amount = z
  .union([z.string().regex(/^\d{1,12}$/, 'Enter the price in the smallest unit (paise), digits only.'), z.number().int().min(0).max(1e12), z.bigint().min(BigInt(0)).max(BigInt(1e12))])
  .transform((v) => BigInt(v));

/** A plan's price with the tax it carries, in the plan's country today. */
async function priced(plan: { countryCode: string; taxCategory: string; priceMinor: bigint; currency: string }, at: Date = new Date()) {
  const rate = await requireTaxRate(plan.countryCode, plan.taxCategory as TaxCategory, at);
  const tax = taxOn({ amountMinor: plan.priceMinor, currency: plan.currency }, rate.rateBasisPoints).amountMinor;
  return { netMinor: plan.priceMinor, taxMinor: tax, grossMinor: plan.priceMinor + tax, rateBasisPoints: rate.rateBasisPoints };
}

// ---------------------------------------------------------------------------
// Plans (staff)
// ---------------------------------------------------------------------------

const planFields = {
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/, 'Use 3–40 lowercase letters, digits and hyphens.'),
  name: z.string().trim().min(3, 'Name the plan.').max(80),
  audience: z.enum(['ORGANIZATION', 'INDIVIDUAL']),
  countryCode: z.string().trim().toUpperCase().length(2),
  priceMinor: amount,
  periodMonths: z.union(PERIODS.map((p) => z.literal(p)) as unknown as [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<6>, z.ZodLiteral<12>, z.ZodLiteral<24>], { error: 'Choose 1, 3, 6, 12 or 24 months.' }),
  bonusFreeLeads: z.number().int().min(0).max(1000).optional(),
  primeBadge: z.boolean().optional(),
  prioritySupport: z.boolean().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
};
export const planSchema = z.object(planFields);
export const planUpdateSchema = z.object(planFields).omit({ code: true, audience: true, countryCode: true }).partial().extend({ action: z.enum(['ACTIVATE', 'RETIRE']).optional() });

function checkAudience(audience: 'ORGANIZATION' | 'INDIVIDUAL', plan: { bonusFreeLeads?: number; primeBadge?: boolean }) {
  if (audience === 'INDIVIDUAL' && ((plan.bonusFreeLeads ?? 0) > 0 || plan.primeBadge)) {
    throw errors.validation('Bonus leads and the Prime badge are for organizations.', { field: 'audience' });
  }
}

export async function createPlan(principal: Principal, raw: z.input<typeof planSchema>, context: { requestId?: string } = {}) {
  const me = staff(principal);
  const input = parse(planSchema, raw);
  checkAudience(input.audience, input);
  const country = await db().country.findUnique({ where: { code: input.countryCode }, select: { defaultCurrency: true } });
  if (!country) throw errors.validation('That country is not modelled.', { field: 'countryCode' });
  const id = newId('membershipPlan');
  try {
    await db().membershipPlan.create({
      data: {
        id,
        code: input.code,
        name: input.name,
        audience: input.audience,
        countryCode: input.countryCode,
        currency: country.defaultCurrency,
        priceMinor: input.priceMinor,
        periodMonths: input.periodMonths,
        bonusFreeLeads: input.bonusFreeLeads ?? 0,
        primeBadge: input.primeBadge ?? false,
        prioritySupport: input.prioritySupport ?? false,
        description: input.description || null,
        createdByUserId: me.userId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('A plan with that code exists.');
    throw error;
  }
  await recordAuditEvent({ action: 'PRIME_PLAN_CREATED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { code: input.code, audience: input.audience, priceMinor: input.priceMinor.toString(), periodMonths: input.periodMonths } });
  return { planId: id };
}

/** Edit a draft; put a draft on sale (its tax must be configured); retire a plan on sale. */
export async function updatePlan(principal: Principal, planId: string, raw: z.input<typeof planUpdateSchema>, context: { requestId?: string } = {}) {
  const me = staff(principal);
  const plan = await db().membershipPlan.findUnique({ where: { id: planId } });
  if (!plan) throw errors.notFound('Plan');
  const { action, ...fields } = parse(planUpdateSchema, raw);
  const editing = Object.values(fields).some((v) => v !== undefined);
  if (editing && plan.status !== 'DRAFT') throw errors.preconditionFailed('A plan on sale is not edited: retire it and create a new one, so members keep the terms they bought.');
  checkAudience(plan.audience, { bonusFreeLeads: fields.bonusFreeLeads ?? plan.bonusFreeLeads, primeBadge: fields.primeBadge ?? plan.primeBadge });
  let status: MembershipPlanStatus = plan.status;
  if (action === 'ACTIVATE') {
    if (plan.status !== 'DRAFT') throw errors.preconditionFailed('Only a draft can be put on sale.');
    await requireTaxRate(plan.countryCode, plan.taxCategory as TaxCategory);
    status = 'ACTIVE';
  }
  if (action === 'RETIRE') {
    if (plan.status !== 'ACTIVE') throw errors.preconditionFailed('Only a plan on sale can be retired.');
    status = 'RETIRED';
  }
  const updated = await db().membershipPlan.update({ where: { id: planId }, data: { ...fields, description: fields.description === undefined ? undefined : fields.description || null, status } });
  await recordAuditEvent({ action: action ? `PRIME_PLAN_${action}` : 'PRIME_PLAN_UPDATED', actor: me.userId, subject: planId, outcome: 'success', requestId: context.requestId });
  return updated;
}

export async function listPlans(principal: Principal) {
  staff(principal);
  const plans = await db().membershipPlan.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { memberships: { where: { status: 'ACTIVE' } } } } } });
  return Promise.all(
    plans.map(async (p) => ({
      ...p,
      price: await priced(p).catch(() => null),
    })),
  );
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function entitlementsFor(organizationId: string, now: Date = new Date()) {
  const membership = await db().membership.findFirst({ where: { organizationId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } }, include: { plan: true } });
  if (!membership) return null;
  const bonusUsed = await db().lead.count({ where: { membershipId: membership.id, billingStatus: 'FREE' } });
  return { membership, bonusFreeLeads: membership.plan.bonusFreeLeads, bonusUsed, primeBadge: membership.plan.primeBadge, prioritySupport: membership.plan.prioritySupport };
}

/** Which of these organizations show the Prime badge now. Display only: nothing ranks by it. */
export async function primeBadgeHolders(organizationIds: readonly string[], now: Date = new Date()): Promise<Set<string>> {
  if (organizationIds.length === 0) return new Set();
  const rows = await db().membership.findMany({ where: { organizationId: { in: [...organizationIds] }, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now }, plan: { primeBadge: true } }, select: { organizationId: true } });
  return new Set(rows.map((r) => r.organizationId!));
}

function manager(principal: Principal, organizationId: string): AuthenticatedPrincipal {
  if (!isAuthenticated(principal) || !can(principal, MEMBERSHIP_MANAGE, { organizationId })) throw errors.notFound('Organization');
  return principal;
}

export async function primeConsole(principal: Principal, organizationId: string, now: Date = new Date()) {
  manager(principal, organizationId);
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true, countryCode: true, currency: true, wallet: { select: { balanceMinor: true, currency: true } } } });
  if (!organization) throw errors.notFound('Organization');
  const [current, history, plans] = await Promise.all([
    entitlementsFor(organizationId, now),
    db().membership.findMany({ where: { organizationId }, include: { plan: { select: { name: true } } }, orderBy: { startsAt: 'desc' }, take: 24 }),
    db().membershipPlan.findMany({ where: { audience: 'ORGANIZATION', status: 'ACTIVE', countryCode: organization.countryCode }, orderBy: { priceMinor: 'asc' } }),
  ]);
  const offers = await Promise.all(plans.map(async (p) => ({ plan: p, price: await priced(p, now).catch(() => null) })));
  return { organization, current, history, offers: offers.filter((o) => o.price !== null) as Array<{ plan: (typeof plans)[number]; price: Awaited<ReturnType<typeof priced>> }> };
}

export const buySchema = z.object({ planId: z.string().max(64) });

export async function buyMembership(principal: Principal, organizationId: string, raw: z.input<typeof buySchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = manager(principal, organizationId);
  const now = context.now ?? new Date();
  const { planId } = parse(buySchema, raw);
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true, countryCode: true } });
  if (!organization) throw errors.notFound('Organization');
  const plan = await db().membershipPlan.findFirst({ where: { id: planId, status: 'ACTIVE', audience: 'ORGANIZATION', countryCode: organization.countryCode } });
  if (!plan) throw errors.notFound('Plan');
  // Checked before anything is charged: a member must hear "already a member",
  // not "recharge the wallet". The unique open key stays the backstop.
  const current = await db().membership.findFirst({ where: { organizationId, status: 'ACTIVE' }, select: { endsAt: true } });
  if (current) throw errors.conflict(`This organization is already a Prime member until ${dateText(current.endsAt)}.`);
  const price = await priced(plan, now);
  const id = newId('membership');
  const endsAt = addMonths(now, plan.periodMonths);
  try {
    await transaction(async (tx) => {
      const charge = await chargeMembership(tx, organizationId, {
        idempotencyKey: `membership:${id}`,
        netMinor: price.netMinor,
        taxMinor: price.taxMinor,
        taxRateBasisPoints: price.rateBasisPoints,
        currency: plan.currency,
        memo: `Prime: ${plan.name}, ${dateText(now)} to ${dateText(endsAt)}`,
        actorUserId: me.userId,
      });
      if (!charge.ok) {
        throw errors.preconditionFailed(`Your lead wallet holds ${money(charge.balanceMinor, plan.currency)}; ${plan.name} costs ${money(price.grossMinor, plan.currency)} with tax. Recharge the wallet first.`);
      }
      await tx.membership.create({
        data: { id, planId: plan.id, organizationId, startsAt: now, endsAt, openKey: `org:${organizationId}`, netMinor: price.netMinor, taxMinor: price.taxMinor, currency: plan.currency, chargeEntryId: charge.entryId },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This organization already has a current Prime membership.');
    throw error;
  }
  await recordAuditEvent({ action: 'PRIME_MEMBERSHIP_STARTED', actor: me.userId, subject: id, outcome: 'success', organizationId, requestId: context.requestId, detail: { planId: plan.id, grossMinor: price.grossMinor.toString() } });
  await notifyOrganizationAdmins({ organizationId, notificationId: 'TL-NOTIF-MEMBERSHIP-001', data: { summary: `${organization.name} is a Prime member (${plan.name}) until ${dateText(endsAt)}. ${money(price.grossMinor, plan.currency)} was charged to the lead wallet.` }, linkUrl: `/account/organizations/${organizationId}/prime` });
  return { membershipId: id, endsAt, grossMinor: price.grossMinor };
}

export const autoRenewSchema = z.object({ autoRenew: z.boolean() });

export async function setAutoRenew(principal: Principal, membershipId: string, raw: z.input<typeof autoRenewSchema>, context: { requestId?: string } = {}) {
  const membership = await db().membership.findUnique({ where: { id: membershipId }, select: { id: true, organizationId: true, status: true } });
  if (!membership?.organizationId) throw errors.notFound('Membership');
  const me = manager(principal, membership.organizationId);
  const { autoRenew } = parse(autoRenewSchema, raw);
  if (membership.status !== 'ACTIVE') throw errors.preconditionFailed('This membership period has ended.');
  await db().membership.update({ where: { id: membershipId }, data: { autoRenew } });
  await recordAuditEvent({ action: autoRenew ? 'PRIME_AUTO_RENEW_ON' : 'PRIME_AUTO_RENEW_OFF', actor: me.userId, subject: membershipId, outcome: 'success', organizationId: membership.organizationId, requestId: context.requestId });
  return { autoRenew };
}

/**
 * A person buys an individual plan. It needs a payment provider: the payment
 * port answers NOT_CONFIGURED until one is connected, and no membership is
 * created before a verified payment.
 */
export async function buyIndividualMembership(principal: Principal, raw: z.input<typeof buySchema>) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const { planId } = parse(buySchema, raw);
  const plan = await db().membershipPlan.findFirst({ where: { id: planId, status: 'ACTIVE', audience: 'INDIVIDUAL' } });
  if (!plan) throw errors.notFound('Plan');
  const price = await priced(plan);
  const intent = await paymentProvider.get().createIntent({
    amount: { amountMinor: price.grossMinor, currency: plan.currency },
    reference: `prime:${plan.id}:${principal.userId}`,
    description: `Toothlogy Prime: ${plan.name}`,
    idempotencyKey: `prime:${plan.id}:${principal.userId}:${new Date().toISOString().slice(0, 10)}`,
  });
  return { status: intent.status, actionUrl: intent.actionUrl ?? null };
}

// ---------------------------------------------------------------------------
// Renewal (scheduled job)
// ---------------------------------------------------------------------------

/**
 * End every period that is over; renew it from the wallet when auto-renew is
 * on and the plan is still on sale, else it simply ends. Each period renews
 * at most once (unique `renewedFromId`), and the charge is keyed to it.
 */
export async function renewMemberships(now: Date = new Date()) {
  const due = await db().membership.findMany({ where: { status: 'ACTIVE', endsAt: { lte: now }, organizationId: { not: null } }, include: { plan: true, organization: { select: { name: true, deletedAt: true } } }, take: 200 });
  let renewed = 0;
  let ended = 0;
  for (const m of due) {
    const organizationId = m.organizationId!;
    const wantsRenewal = m.autoRenew && m.plan.status === 'ACTIVE' && m.organization?.deletedAt === null;
    const price = wantsRenewal ? await priced(m.plan, now).catch(() => null) : null;
    const outcome = await transaction(async (tx) => {
      const claim = await tx.membership.updateMany({ where: { id: m.id, status: 'ACTIVE' }, data: { status: 'ENDED', openKey: null } });
      if (claim.count === 0) return 'SKIPPED' as const;
      if (!wantsRenewal || !price) {
        await tx.membership.update({ where: { id: m.id }, data: { endedReason: !m.autoRenew ? 'Auto-renew was off' : m.plan.status !== 'ACTIVE' ? 'The plan is no longer on sale' : 'Tax is not configured for renewal' } });
        return 'ENDED' as const;
      }
      const nextId = newId('membership');
      const endsAt = addMonths(m.endsAt, m.plan.periodMonths);
      const charge = await chargeMembership(tx, organizationId, {
        idempotencyKey: `membership-renewal:${m.id}`,
        netMinor: price.netMinor,
        taxMinor: price.taxMinor,
        taxRateBasisPoints: price.rateBasisPoints,
        currency: m.plan.currency,
        memo: `Prime renewal: ${m.plan.name}, ${dateText(m.endsAt)} to ${dateText(endsAt)}`,
        actorUserId: null,
      });
      if (!charge.ok) {
        await tx.membership.update({ where: { id: m.id }, data: { endedReason: 'Renewal failed: the lead wallet could not cover it' } });
        return 'FAILED' as const;
      }
      await tx.membership.create({
        data: { id: nextId, planId: m.planId, organizationId, startsAt: m.endsAt, endsAt, autoRenew: true, openKey: `org:${organizationId}`, netMinor: price.netMinor, taxMinor: price.taxMinor, currency: m.plan.currency, chargeEntryId: charge.entryId, renewedFromId: m.id },
      });
      return { endsAt, grossMinor: price.grossMinor };
    });
    if (outcome === 'SKIPPED') continue;
    const name = m.organization?.name ?? 'Your organization';
    const summary =
      outcome === 'ENDED'
        ? `${name}’s Prime membership (${m.plan.name}) ended on ${dateText(m.endsAt)}.`
        : outcome === 'FAILED'
          ? `${name}’s Prime membership (${m.plan.name}) could not renew: the lead wallet did not cover ${price ? money(price.grossMinor, m.plan.currency) : 'it'}. Recharge and buy it again to keep the benefits.`
          : `${name}’s Prime membership (${m.plan.name}) renewed until ${dateText(outcome.endsAt)}; ${money(outcome.grossMinor, m.plan.currency)} was charged to the lead wallet.`;
    await notifyOrganizationAdmins({ organizationId, notificationId: 'TL-NOTIF-MEMBERSHIP-001', data: { summary }, linkUrl: `/account/organizations/${organizationId}/prime` });
    if (typeof outcome === 'object') renewed += 1;
    else ended += 1;
  }
  return { renewed, ended };
}
