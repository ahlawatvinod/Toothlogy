/**
 * TOOTHLOGY EQUIPMENT — a practice's equipment register, warranties, and
 * maintenance contracts with service businesses
 *
 * REGISTER (the practice) · CONTRACT: a business PROPOSES → the practice
 * ACCEPTS, choosing which of its equipment it covers (or declines) → ACTIVE
 * → visits: the practice REQUESTS a preventive visit (counted against those
 * included) or a breakdown call → the business SCHEDULES → COMPLETES with a
 * report → the contract ends on its date (EXPIRED), or either side cancels.
 *
 * - A business may propose only to a practice that has traded with it —
 *   ordered from it, asked it for a quote, or lists it as a supplier — so a
 *   contract is never a cold offer.
 * - A business never sees a practice's register; the practice picks what a
 *   contract covers when it accepts.
 * - Paid between the parties; Toothlogy records the contract.
 * - Reminders 30 days before a warranty or contract ends, once per date.
 */

import { z } from 'zod';
import { Prisma, type ServiceContractStatus, type ServiceVisitStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { formatMoney } from '../money';
import { BUSINESS_TYPES, isBusinessType } from '../catalogue/marketplace';

const ASSET_READ = 'tl.equipment.asset.read';
const ASSET_MANAGE = 'tl.equipment.asset.manage';
const CONTRACT_MANAGE = 'tl.equipment.contract.manage';
const DAY = 86_400_000;

export const EQUIPMENT_CATEGORIES = ['equipment', 'imaging', 'handpieces', 'sterilization', 'furniture', 'instruments', 'software', 'other'] as const;
export const EQUIPMENT_CATEGORY_LABEL: Record<(typeof EQUIPMENT_CATEGORIES)[number], string> = {
  equipment: 'Chairs and equipment',
  imaging: 'Imaging and X-ray',
  handpieces: 'Handpieces and motors',
  sterilization: 'Sterilization',
  furniture: 'Furniture',
  instruments: 'Instruments',
  software: 'Software',
  other: 'Other',
};
export const CONTRACT_STATUS_LABEL: Record<ServiceContractStatus, string> = {
  PROPOSED: 'Proposed',
  ACTIVE: 'Active',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Ended',
};
export const VISIT_STATUS_LABEL: Record<ServiceVisitStatus, string> = {
  REQUESTED: 'Requested',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const money = (amountMinor: bigint, currency: string) => formatMoney({ amountMinor, currency }, 'en-IN');
const dateText = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
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

const isUnique = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
// A calendar day as YYYY-MM-DD (from a form), or a Date (already parsed by a route).
const day = z
  .union([
    z.date(),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.')
      .transform((s) => new Date(`${s}T00:00:00Z`)),
  ])
  .refine((d) => !Number.isNaN(d.getTime()), 'Enter a real date.');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const amount = z
  .union([z.string().regex(/^\d{1,12}$/, 'Enter the amount in the smallest unit (paise), digits only.'), z.number().int().min(0).max(1e12), z.bigint().min(BigInt(0)).max(BigInt(1e12))])
  .transform((v) => BigInt(v));

function orgWith(principal: Principal, organizationId: string, permission: string): AuthenticatedPrincipal {
  if (!isAuthenticated(principal) || !can(principal, permission, { organizationId })) throw errors.notFound('Organization');
  return principal;
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

const assetFields = {
  name: z.string().trim().min(2, 'Name the equipment.').max(120),
  category: z.enum(EQUIPMENT_CATEGORIES),
  brand: optionalText(80),
  model: optionalText(80),
  serialNumber: optionalText(60),
  purchasedOn: day.nullable().optional(),
  warrantyUntil: day.nullable().optional(),
  supplierOrganizationId: z.string().max(64).nullable().optional(),
  orderLineId: z.string().max(64).nullable().optional(),
  notes: optionalText(1000),
};
export const assetSchema = z.object(assetFields);
export const assetUpdateSchema = z.object(assetFields).partial().extend({ status: z.enum(['IN_USE', 'RETIRED']).optional() });

async function checkAsset(organizationId: string, input: { purchasedOn?: Date | null; warrantyUntil?: Date | null; supplierOrganizationId?: string | null; orderLineId?: string | null }) {
  if (input.purchasedOn && input.purchasedOn.getTime() > Date.now() + DAY) throw errors.validation('The purchase date cannot be in the future.', { field: 'purchasedOn' });
  if (input.purchasedOn && input.warrantyUntil && input.warrantyUntil < input.purchasedOn) throw errors.validation('The warranty cannot end before the purchase.', { field: 'warrantyUntil' });
  if (input.supplierOrganizationId) {
    const supplier = await db().organization.findFirst({ where: { id: input.supplierOrganizationId, deletedAt: null, type: { in: [...BUSINESS_TYPES] } }, select: { id: true } });
    if (!supplier) throw errors.validation('Choose a supplier listed on Toothlogy.', { field: 'supplierOrganizationId' });
  }
  if (input.orderLineId) {
    const line = await db().orderLine.findFirst({ where: { id: input.orderLineId, order: { buyerOrganizationId: organizationId, status: 'DELIVERED' } }, select: { order: { select: { sellerOrganizationId: true, deliveredAt: true } } } });
    if (!line) throw errors.validation('That is not an item delivered to this organization.', { field: 'orderLineId' });
    return line.order;
  }
  return null;
}

export async function addAsset(principal: Principal, organizationId: string, raw: z.input<typeof assetSchema>, context: { requestId?: string } = {}) {
  const me = orgWith(principal, organizationId, ASSET_MANAGE);
  const input = parse(assetSchema, raw);
  const bought = await checkAsset(organizationId, input);
  const id = newId('asset');
  try {
    await db().equipmentAsset.create({
      data: {
        id,
        organizationId,
        name: input.name,
        category: input.category,
        brand: input.brand || null,
        model: input.model || null,
        serialNumber: input.serialNumber || null,
        purchasedOn: input.purchasedOn ?? bought?.deliveredAt ?? null,
        warrantyUntil: input.warrantyUntil ?? null,
        supplierOrganizationId: input.supplierOrganizationId ?? bought?.sellerOrganizationId ?? null,
        orderLineId: input.orderLineId ?? null,
        notes: input.notes || null,
      },
    });
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('This organization already lists equipment with that serial number.');
    throw error;
  }
  await recordAuditEvent({ action: 'EQUIPMENT_ADDED', actor: me.userId, subject: id, outcome: 'success', organizationId, requestId: context.requestId });
  return { assetId: id };
}

export async function updateAsset(principal: Principal, assetId: string, raw: z.input<typeof assetUpdateSchema>, context: { requestId?: string } = {}) {
  const asset = await db().equipmentAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw errors.notFound('Equipment');
  const me = orgWith(principal, asset.organizationId, ASSET_MANAGE);
  const input = parse(assetUpdateSchema, raw);
  await checkAsset(asset.organizationId, {
    purchasedOn: input.purchasedOn !== undefined ? input.purchasedOn : asset.purchasedOn,
    warrantyUntil: input.warrantyUntil !== undefined ? input.warrantyUntil : asset.warrantyUntil,
    supplierOrganizationId: input.supplierOrganizationId,
    orderLineId: input.orderLineId,
  });
  try {
    const updated = await db().equipmentAsset.update({ where: { id: assetId }, data: { ...input, ...(input.serialNumber !== undefined ? { serialNumber: input.serialNumber || null } : {}) } });
    await recordAuditEvent({ action: 'EQUIPMENT_UPDATED', actor: me.userId, subject: assetId, outcome: 'success', organizationId: asset.organizationId, requestId: context.requestId, detail: { status: input.status ?? null } });
    return updated;
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('This organization already lists equipment with that serial number.');
    throw error;
  }
}

/** A practice's register, its contracts and visits, and items delivered to it that could join the register. */
export async function equipmentConsole(principal: Principal, organizationId: string) {
  const me = orgWith(principal, organizationId, ASSET_READ);
  const [organization, assets, contracts, deliveredLines] = await Promise.all([
    db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, name: true } }),
    db().equipmentAsset.findMany({
      where: { organizationId },
      include: { supplier: { select: { name: true, slug: true } }, contracts: { where: { contract: { status: 'ACTIVE' } }, select: { contract: { select: { id: true, kind: true, endsOn: true, provider: { select: { name: true } } } } } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    db().serviceContract.findMany({
      where: { clientOrganizationId: organizationId },
      include: {
        provider: { select: { name: true, slug: true, phone: true, email: true } },
        assets: { select: { asset: { select: { id: true, name: true } } } },
        visits: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { name: true } } } },
      },
      orderBy: [{ status: 'asc' }, { endsOn: 'asc' }],
    }),
    db().orderLine.findMany({
      where: { order: { buyerOrganizationId: organizationId, status: 'DELIVERED' } },
      select: { id: true, name: true, variantLabel: true, order: { select: { number: true, deliveredAt: true, seller: { select: { id: true, name: true } } } } },
      orderBy: { order: { deliveredAt: 'desc' } },
      take: 50,
    }),
  ]);
  if (!organization) throw errors.notFound('Organization');
  return { organization, assets, contracts, deliveredLines, canManage: can(me, ASSET_MANAGE, { organizationId }) };
}

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

async function hasTraded(providerId: string, clientId: string): Promise<boolean> {
  const [orders, quotes, supplied] = await Promise.all([
    db().order.count({ where: { sellerOrganizationId: providerId, buyerOrganizationId: clientId } }),
    db().quoteRequest.count({ where: { sellerOrganizationId: providerId, buyerOrganizationId: clientId } }),
    db().equipmentAsset.count({ where: { organizationId: clientId, supplierOrganizationId: providerId } }),
  ]);
  return orders + quotes + supplied > 0;
}

/** Practices a business may propose to: those that have traded with it. */
async function tradingPartners(providerId: string) {
  const [orders, quotes, supplied] = await Promise.all([
    db().order.findMany({ where: { sellerOrganizationId: providerId, buyerOrganizationId: { not: null } }, select: { buyerOrganizationId: true }, distinct: ['buyerOrganizationId'] }),
    db().quoteRequest.findMany({ where: { sellerOrganizationId: providerId, buyerOrganizationId: { not: null } }, select: { buyerOrganizationId: true }, distinct: ['buyerOrganizationId'] }),
    db().equipmentAsset.findMany({ where: { supplierOrganizationId: providerId }, select: { organizationId: true }, distinct: ['organizationId'] }),
  ]);
  const ids = [...new Set([...orders.map((o) => o.buyerOrganizationId!), ...quotes.map((q) => q.buyerOrganizationId!), ...supplied.map((a) => a.organizationId)])].filter((id) => id !== providerId);
  return db().organization.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

export const contractProposalSchema = z.object({
  kind: z.enum(['AMC', 'CMC']),
  clientOrganizationId: z.string().min(1, 'Choose the practice.').max(64),
  startsOn: day,
  endsOn: day,
  visitsIncluded: z.number().int().min(0).max(24),
  responseHours: z.number().int().min(1).max(720).nullable().optional(),
  priceMinor: amount,
  terms: optionalText(4000),
});

export async function proposeContract(principal: Principal, providerOrganizationId: string, raw: z.input<typeof contractProposalSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = orgWith(principal, providerOrganizationId, CONTRACT_MANAGE);
  const now = context.now ?? new Date();
  const provider = await db().organization.findFirst({ where: { id: providerOrganizationId, deletedAt: null }, select: { id: true, name: true, type: true, currency: true } });
  if (!provider) throw errors.notFound('Organization');
  if (!isBusinessType(provider.type)) throw errors.preconditionFailed('Maintenance contracts are offered by dental businesses.');
  const input = parse(contractProposalSchema, raw);
  if (input.endsOn <= input.startsOn) throw errors.validation('The contract must end after it starts.', { field: 'endsOn' });
  if (input.endsOn.getTime() - input.startsOn.getTime() > 3 * 366 * DAY) throw errors.validation('A contract runs for up to three years.', { field: 'endsOn' });
  if (input.startsOn.getTime() < now.getTime() - 31 * DAY) throw errors.validation('A contract cannot start more than a month ago.', { field: 'startsOn' });
  const client = input.clientOrganizationId === provider.id ? null : await db().organization.findFirst({ where: { id: input.clientOrganizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!client || !(await hasTraded(provider.id, client.id))) {
    throw errors.preconditionFailed('You can propose a contract to a practice that has ordered from you, asked you for a quote, or lists you as its equipment supplier.');
  }
  const id = newId('serviceContract');
  await db().serviceContract.create({
    data: {
      id,
      kind: input.kind,
      providerOrganizationId: provider.id,
      clientOrganizationId: client.id,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      visitsIncluded: input.visitsIncluded,
      responseHours: input.responseHours ?? null,
      priceMinor: input.priceMinor,
      currency: provider.currency,
      terms: input.terms || null,
      proposedByUserId: me.userId,
    },
  });
  await recordAuditEvent({ action: 'SERVICE_CONTRACT_PROPOSED', actor: me.userId, subject: id, outcome: 'success', organizationId: provider.id, requestId: context.requestId });
  await notifyOrganizationAdmins({
    organizationId: client.id,
    notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001',
    data: { summary: `${provider.name} proposed an ${input.kind} contract: ${input.visitsIncluded} preventive visits, ${money(input.priceMinor, provider.currency)}, ${dateText(input.startsOn)} to ${dateText(input.endsOn)}. Accept or decline it under Equipment.` },
    linkUrl: `/account/organizations/${client.id}/equipment`,
  });
  return { contractId: id };
}

const reason = z.string().trim().min(3, 'Say why.').max(1000);
export const contractActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ACCEPT'), assetIds: z.array(z.string().max(64)).max(50).optional() }),
  z.object({ action: z.literal('DECLINE'), note: reason }),
  z.object({ action: z.literal('CANCEL'), note: reason }),
]);

export async function actOnContract(principal: Principal, contractId: string, raw: z.input<typeof contractActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const now = context.now ?? new Date();
  const contract = await db().serviceContract.findUnique({ where: { id: contractId }, include: { provider: { select: { name: true } }, client: { select: { name: true } } } });
  if (!contract) throw errors.notFound('Contract');
  const client = { organizationId: contract.clientOrganizationId };
  const asClient = can(me, ASSET_MANAGE, client);
  const asProvider = can(me, CONTRACT_MANAGE, { organizationId: contract.providerOrganizationId });
  if (!asClient && !asProvider) throw can(me, ASSET_READ, client) ? errors.forbidden(ASSET_MANAGE) : errors.notFound('Contract');
  const input = parse(contractActionSchema, raw);
  if ((input.action === 'ACCEPT' || input.action === 'DECLINE') && !asClient) throw errors.forbidden(ASSET_MANAGE);

  let from: ServiceContractStatus[];
  let to: ServiceContractStatus;
  let data: Prisma.ServiceContractUpdateManyMutationInput;
  let assetIds: string[] = [];
  switch (input.action) {
    case 'ACCEPT':
      if (contract.endsOn.getTime() <= now.getTime()) throw errors.preconditionFailed('This proposal’s dates have passed. Ask the business for a new one.');
      assetIds = [...new Set(input.assetIds ?? [])];
      if (assetIds.length && (await db().equipmentAsset.count({ where: { id: { in: assetIds }, organizationId: contract.clientOrganizationId, status: 'IN_USE' } })) !== assetIds.length) {
        throw errors.validation('Choose equipment from your own register that is in use.', { field: 'assetIds' });
      }
      from = ['PROPOSED'];
      to = 'ACTIVE';
      data = { decidedByUserId: me.userId, decidedAt: now };
      break;
    case 'DECLINE':
      from = ['PROPOSED'];
      to = 'DECLINED';
      data = { decidedByUserId: me.userId, decidedAt: now, cancelReason: input.note };
      break;
    case 'CANCEL':
      from = ['PROPOSED', 'ACTIVE'];
      to = 'CANCELLED';
      data = { cancelReason: input.note };
      break;
  }
  if (!from.includes(contract.status)) throw errors.preconditionFailed(`A contract that is “${CONTRACT_STATUS_LABEL[contract.status].toLowerCase()}” cannot be changed that way.`);
  await transaction(async (tx) => {
    const claim = await tx.serviceContract.updateMany({ where: { id: contractId, status: contract.status }, data: { ...data, status: to } });
    if (claim.count === 0) throw errors.conflict('This contract changed while you were acting on it. Refresh and try again.');
    if (assetIds.length) await tx.serviceContractAsset.createMany({ data: assetIds.map((assetId) => ({ contractId, assetId })) });
  });
  await recordAuditEvent({ action: `SERVICE_CONTRACT_${input.action}`, actor: me.userId, subject: contractId, outcome: 'success', organizationId: asClient ? contract.clientOrganizationId : contract.providerOrganizationId, requestId: context.requestId });
  const byClient = asClient && (input.action !== 'CANCEL' || !asProvider);
  const summary =
    input.action === 'ACCEPT'
      ? `${contract.client.name} accepted your ${contract.kind} contract${assetIds.length ? ` for ${assetIds.length} ${assetIds.length === 1 ? 'item' : 'items'} of equipment` : ''}.`
      : input.action === 'DECLINE'
        ? `${contract.client.name} declined your ${contract.kind} contract: ${input.note}`
        : `${byClient ? contract.client.name : contract.provider.name} cancelled the ${contract.kind} contract: ${input.note}`;
  const otherSide = byClient ? contract.providerOrganizationId : contract.clientOrganizationId;
  await notifyOrganizationAdmins({ organizationId: otherSide, notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001', data: { summary }, linkUrl: byClient ? `/account/organizations/${otherSide}/service-contracts` : `/account/organizations/${otherSide}/equipment` });
  return { status: to };
}

/** A service business's contracts, their visits, and the practices it may propose to. */
export async function providerContracts(principal: Principal, providerOrganizationId: string) {
  orgWith(principal, providerOrganizationId, CONTRACT_MANAGE);
  const organization = await db().organization.findFirst({ where: { id: providerOrganizationId, deletedAt: null }, select: { id: true, name: true, type: true, currency: true } });
  if (!organization) throw errors.notFound('Organization');
  const [contracts, partners] = await Promise.all([
    db().serviceContract.findMany({
      where: { providerOrganizationId },
      include: { client: { select: { name: true, phone: true, email: true } }, assets: { select: { asset: { select: { name: true, model: true, serialNumber: true } } } }, visits: { orderBy: { createdAt: 'desc' }, include: { asset: { select: { name: true } } } } },
      orderBy: [{ status: 'asc' }, { endsOn: 'asc' }],
    }),
    isBusinessType(organization.type) ? tradingPartners(providerOrganizationId) : Promise.resolve([]),
  ]);
  return { organization, contracts, partners, canPropose: isBusinessType(organization.type) };
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

export const visitRequestSchema = z.object({
  kind: z.enum(['PREVENTIVE', 'BREAKDOWN']),
  assetId: z.string().max(64).nullable().optional(),
  issue: z.string().trim().max(2000).optional(),
});

export async function requestVisit(principal: Principal, contractId: string, raw: z.input<typeof visitRequestSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const now = context.now ?? new Date();
  const contract = await db().serviceContract.findUnique({ where: { id: contractId }, include: { assets: { include: { asset: { select: { name: true } } } }, client: { select: { name: true } } } });
  if (!contract) throw errors.notFound('Contract');
  const client = { organizationId: contract.clientOrganizationId };
  if (!can(me, ASSET_MANAGE, client)) throw can(me, ASSET_READ, client) ? errors.forbidden(ASSET_MANAGE) : errors.notFound('Contract');
  const input = parse(visitRequestSchema, raw);
  if (contract.status !== 'ACTIVE' || now < contract.startsOn || now.getTime() > contract.endsOn.getTime() + DAY) throw errors.preconditionFailed('Visits can be requested while the contract is running.');
  if (input.kind === 'BREAKDOWN' && !input.issue) throw errors.validation('Describe the problem.', { field: 'issue' });
  const covered = input.assetId ? contract.assets.find((a) => a.assetId === input.assetId) : null;
  if (input.assetId && !covered) throw errors.validation('Choose equipment this contract covers.', { field: 'assetId' });
  const id = newId('serviceVisit');
  await transaction(async (tx) => {
    // Taking the contract row serialises visit requests, so the included
    // preventive visits cannot be overdrawn by two requests at once.
    await tx.$queryRaw`SELECT "id" FROM "service_contracts" WHERE "id" = ${contractId} FOR UPDATE`;
    if (input.kind === 'PREVENTIVE') {
      const used = await tx.serviceVisit.count({ where: { contractId, kind: 'PREVENTIVE', status: { not: 'CANCELLED' } } });
      if (used >= contract.visitsIncluded) throw errors.preconditionFailed(`All ${contract.visitsIncluded} preventive visits in this contract are used.`);
    }
    await tx.serviceVisit.create({ data: { id, contractId, assetId: input.assetId ?? null, kind: input.kind, issue: input.issue || null, requestedByUserId: me.userId } });
  });
  await recordAuditEvent({ action: 'SERVICE_VISIT_REQUESTED', actor: me.userId, subject: id, outcome: 'success', organizationId: contract.clientOrganizationId, requestId: context.requestId });
  await notifyOrganizationAdmins({
    organizationId: contract.providerOrganizationId,
    notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001',
    data: { summary: `${contract.client.name} requested a ${input.kind === 'BREAKDOWN' ? 'breakdown call' : 'preventive visit'}${covered ? ` for ${covered.asset.name}` : ''}${contract.responseHours && input.kind === 'BREAKDOWN' ? ` (your stated response time is ${contract.responseHours} hours)` : ''}.` },
    linkUrl: `/account/organizations/${contract.providerOrganizationId}/service-contracts`,
  });
  return { visitId: id };
}

export const visitActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('SCHEDULE'), scheduledFor: z.string().datetime({ offset: true, message: 'Enter the date and time.' }) }),
  z.object({ action: z.literal('COMPLETE'), report: z.string().trim().min(5, 'Say what was done.').max(4000) }),
  z.object({ action: z.literal('CANCEL'), note: reason }),
]);

export async function actOnVisit(principal: Principal, visitId: string, raw: z.input<typeof visitActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const now = context.now ?? new Date();
  const visit = await db().serviceVisit.findUnique({ where: { id: visitId }, include: { contract: { select: { providerOrganizationId: true, clientOrganizationId: true, provider: { select: { name: true } }, client: { select: { name: true } } } }, asset: { select: { name: true } } } });
  if (!visit) throw errors.notFound('Visit');
  const input = parse(visitActionSchema, raw);
  const byProvider = input.action !== 'CANCEL';
  const scope = { organizationId: byProvider ? visit.contract.providerOrganizationId : visit.contract.clientOrganizationId };
  if (!can(me, byProvider ? CONTRACT_MANAGE : ASSET_MANAGE, scope)) {
    const sees = can(me, CONTRACT_MANAGE, { organizationId: visit.contract.providerOrganizationId }) || can(me, ASSET_READ, { organizationId: visit.contract.clientOrganizationId });
    throw sees ? errors.forbidden(byProvider ? CONTRACT_MANAGE : ASSET_MANAGE) : errors.notFound('Visit');
  }
  let to: ServiceVisitStatus;
  let data: Prisma.ServiceVisitUpdateManyMutationInput;
  let summary: string;
  const what = `${visit.kind === 'BREAKDOWN' ? 'breakdown call' : 'preventive visit'}${visit.asset ? ` for ${visit.asset.name}` : ''}`;
  switch (input.action) {
    case 'SCHEDULE': {
      const at = new Date(input.scheduledFor);
      if (at.getTime() < now.getTime() - 60 * 60_000 || at.getTime() > now.getTime() + 180 * DAY) throw errors.validation('Choose a time from now up to six months ahead.', { field: 'scheduledFor' });
      to = 'SCHEDULED';
      data = { scheduledFor: at };
      summary = `${visit.contract.provider.name} scheduled the ${what} for ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(at)}.`;
      break;
    }
    case 'COMPLETE':
      to = 'COMPLETED';
      data = { completedAt: now, report: input.report };
      summary = `${visit.contract.provider.name} completed the ${what}: ${input.report}`;
      break;
    case 'CANCEL':
      to = 'CANCELLED';
      data = { cancelReason: input.note };
      summary = `${visit.contract.client.name} cancelled the ${what}: ${input.note}`;
      break;
  }
  if (visit.status !== 'REQUESTED' && visit.status !== 'SCHEDULED') throw errors.preconditionFailed(`A visit that is “${VISIT_STATUS_LABEL[visit.status].toLowerCase()}” cannot be changed.`);
  const claim = await db().serviceVisit.updateMany({ where: { id: visitId, status: visit.status }, data: { ...data, status: to } });
  if (claim.count === 0) throw errors.conflict('This visit changed while you were acting on it. Refresh and try again.');
  await recordAuditEvent({ action: `SERVICE_VISIT_${input.action}`, actor: me.userId, subject: visitId, outcome: 'success', organizationId: scope.organizationId, requestId: context.requestId });
  const other = byProvider ? visit.contract.clientOrganizationId : visit.contract.providerOrganizationId;
  await notifyOrganizationAdmins({ organizationId: other, notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001', data: { summary }, linkUrl: byProvider ? `/account/organizations/${other}/equipment` : `/account/organizations/${other}/service-contracts` });
  return { status: to };
}

// ---------------------------------------------------------------------------
// Reminders (scheduled job)
// ---------------------------------------------------------------------------

/**
 * Remind a practice 30 days before a warranty or a contract ends — once per
 * end date, claimed in the database so two runs never both send — and mark
 * contracts past their end date as ended.
 */
export async function sendEquipmentReminders(now: Date = new Date()) {
  const soon = new Date(now.getTime() + 30 * DAY);
  let warranties = 0;
  let contracts = 0;

  const assets = await db().equipmentAsset.findMany({ where: { status: 'IN_USE', warrantyUntil: { gte: now, lte: soon } }, select: { id: true, name: true, organizationId: true, warrantyUntil: true, warrantyReminderFor: true }, take: 500 });
  for (const asset of assets) {
    const until = asset.warrantyUntil!;
    if (asset.warrantyReminderFor?.getTime() === until.getTime()) continue;
    const claim = await db().equipmentAsset.updateMany({ where: { id: asset.id, warrantyUntil: until, OR: [{ warrantyReminderFor: null }, { warrantyReminderFor: { not: until } }] }, data: { warrantyReminderFor: until } });
    if (claim.count === 0) continue;
    await notifyOrganizationAdmins({ organizationId: asset.organizationId, notificationId: 'TL-NOTIF-EQUIPMENT-EXPIRY-001', data: { summary: `The warranty on ${asset.name} ends on ${dateText(until)}.` }, linkUrl: `/account/organizations/${asset.organizationId}/equipment` });
    warranties += 1;
  }

  const ending = await db().serviceContract.findMany({ where: { status: 'ACTIVE', endsOn: { gte: now, lte: soon }, expiryReminderAt: null }, include: { provider: { select: { name: true } } }, take: 500 });
  for (const contract of ending) {
    const claim = await db().serviceContract.updateMany({ where: { id: contract.id, expiryReminderAt: null }, data: { expiryReminderAt: now } });
    if (claim.count === 0) continue;
    await notifyOrganizationAdmins({ organizationId: contract.clientOrganizationId, notificationId: 'TL-NOTIF-EQUIPMENT-EXPIRY-001', data: { summary: `Your ${contract.kind} contract with ${contract.provider.name} ends on ${dateText(contract.endsOn)}.` }, linkUrl: `/account/organizations/${contract.clientOrganizationId}/equipment` });
    contracts += 1;
  }

  const expired = await db().serviceContract.updateMany({ where: { status: 'ACTIVE', endsOn: { lt: new Date(now.getTime() - DAY) } }, data: { status: 'EXPIRED' } });
  return { warranties, contracts, expired: expired.count };
}
