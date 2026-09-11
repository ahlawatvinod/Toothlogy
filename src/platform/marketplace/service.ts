/**
 * TOOTHLOGY MARKETPLACE — dental businesses, their catalogue, quote requests
 *
 * BUSINESS PROFILE → PRODUCTS → BUYER ASKS FOR A QUOTE → SELLER QUOTES →
 * BUYER ACCEPTS (or withdraws; the seller may decline) → SELLER CLOSES
 *
 * - Businesses are organizations of type supplier (vendor), manufacturer,
 *   distributor, wholesaler, retailer or laboratory. What they state is
 *   labelled theirs until the organization is verified.
 * - Products and services are listed under a closed set of categories, with
 *   an indicative GST-inclusive price, unit and minimum order.
 * - A quote request is the marketplace's lead: a signed-in buyer with a
 *   verified email, never at their own business, one open request per
 *   product. The seller's quote carries a price and a validity date; an
 *   expired quote cannot be accepted.
 * - No money moves through Toothlogy and nothing is billed: payment and
 *   delivery are arranged between the parties. Checkout stays off until a
 *   payment provider is connected — never faked.
 */

import { z } from 'zod';
import { Prisma, type QuoteStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { slugify } from '../india-data/normalize';
import { BUSINESS_TYPES, CATEGORY_BY_KEY, isBusinessType } from '../catalogue/marketplace';

const CATALOGUE = 'tl.marketplace.catalogue.manage';
const QUOTE_READ = 'tl.marketplace.quote.read';
const QUOTE_MANAGE = 'tl.marketplace.quote.manage';
const DAY = 86_400_000;
const OPEN: QuoteStatus[] = ['NEW', 'QUOTED'];
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  NEW: 'Waiting for a quote',
  QUOTED: 'Quoted',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Quote expired',
  CLOSED: 'Closed',
};

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/** The business the caller may manage; anything else does not exist for them. */
async function managedBusiness(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, CATALOGUE, { organizationId })) throw errors.notFound('Organization');
  const organization = await db().organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { id: true, type: true, currency: true, name: true, status: true } });
  if (!organization) throw errors.notFound('Organization');
  if (!isBusinessType(organization.type)) throw errors.preconditionFailed('The catalogue is for suppliers, manufacturers, distributors, wholesalers, retailers and laboratories.');
  return { organization, actor: principal.userId };
}

// ---------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const businessProfileSchema = z.object({
  categories: z.array(z.string().max(40)).max(18).optional(),
  brands: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  gstin: z.string().trim().toUpperCase().regex(GSTIN, 'That is not a valid GSTIN (15 characters, like 22AAAAA0000A1Z5).').nullable().optional(),
  establishedYear: z.number().int().min(1850).max(2100).nullable().optional(),
  deliveryNote: optionalText(300),
  minimumOrderNote: optionalText(200),
  turnaroundDays: z.number().int().min(1).max(90).nullable().optional(),
  servesAllIndia: z.boolean().optional(),
  serviceDistrictIds: z.array(z.string().max(64)).max(800).optional(),
  returnWindowDays: z.number().int().min(0).max(60).optional(),
  paymentInstructions: optionalText(500),
});

export async function upsertBusinessProfile(principal: Principal, organizationId: string, raw: z.input<typeof businessProfileSchema>, context: { requestId?: string } = {}) {
  const { organization, actor } = await managedBusiness(principal, organizationId);
  const input = businessProfileSchema.parse(raw);
  if (input.categories?.some((c) => !CATEGORY_BY_KEY.has(c))) throw errors.validation('Choose categories from the list.', { field: 'categories' });
  if (input.establishedYear && input.establishedYear > new Date().getFullYear()) throw errors.validation('The year cannot be in the future.', { field: 'establishedYear' });
  if (input.turnaroundDays !== undefined && input.turnaroundDays !== null && organization.type !== 'LABORATORY') throw errors.validation('Turnaround applies to laboratories.', { field: 'turnaroundDays' });
  const districtIds = input.serviceDistrictIds ? [...new Set(input.serviceDistrictIds)] : undefined;
  if (districtIds?.length) {
    const found = await db().district.count({ where: { id: { in: districtIds } } });
    if (found !== districtIds.length) throw errors.validation('One of those districts does not exist.', { field: 'serviceDistrictIds' });
  }
  const { serviceDistrictIds: _areas, ...fields } = input;
  await transaction(async (tx) => {
    await tx.businessProfile.upsert({ where: { organizationId }, create: { organizationId, ...fields, categories: fields.categories ?? [], brands: fields.brands ?? [] }, update: fields });
    if (districtIds) {
      await tx.businessServiceArea.deleteMany({ where: { organizationId } });
      if (districtIds.length) await tx.businessServiceArea.createMany({ data: districtIds.map((districtId) => ({ organizationId, districtId })) });
    }
  });
  await recordAuditEvent({ action: 'BUSINESS_PROFILE_UPDATED', actor, subject: organizationId, outcome: 'success', organizationId, requestId: context.requestId, detail: { areas: districtIds?.length ?? null } });
  return db().businessProfile.findUniqueOrThrow({ where: { organizationId }, include: { serviceAreas: true } });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const price = z.union([z.string().regex(/^\d{1,12}$/, 'Enter the price in paise, digits only.'), z.number().int().min(0).max(1e12), z.bigint().min(BigInt(0)).max(BigInt(1e12))]).transform((v) => BigInt(v));
const productFields = {
  kind: z.enum(['GOOD', 'SERVICE']),
  category: z.string().max(40),
  name: z.string().trim().min(3, 'Name the product.').max(160),
  brand: optionalText(80),
  description: optionalText(4000),
  unit: optionalText(60),
  priceMinor: price.nullable().optional(),
  gstRatePercent: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]).nullable().optional(),
  // No default here: the update schema is these fields made optional, and a
  // default would reset the minimum to 1 on every edit that leaves it out.
  minOrderQuantity: z.number().int().min(1).max(100_000).optional(),
  /** Sold at the listed price, so buyers may order it rather than ask for a quote. */
  orderable: z.boolean().optional(),
  taxCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9.-]{2,20}$/, 'Enter the tax code (HSN or SAC), letters and digits only.').nullable().optional(),
};
export const productSchema = z.object(productFields);
export const productUpdateSchema = z.object(productFields).partial().extend({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional() });

function checkCategory(category: string) {
  if (!CATEGORY_BY_KEY.has(category)) throw errors.validation('Choose a category from the list.', { field: 'category' });
}

/** An orderable item needs a tax rate, and a price of its own or variants with prices. */
async function checkOrderable(item: { orderable: boolean; gstRatePercent: number | null; priceMinor: bigint | null }, productId: string | null) {
  if (!item.orderable) return;
  if (item.gstRatePercent === null) throw errors.validation('Set the tax rate before selling at a listed price.', { field: 'gstRatePercent' });
  if (item.priceMinor === null && (!productId || (await db().productVariant.count({ where: { productId, status: 'ACTIVE' } })) === 0)) {
    throw errors.validation('Give it a price, or add variants with prices, before selling at a listed price.', { field: 'priceMinor' });
  }
}

export async function createProduct(principal: Principal, organizationId: string, raw: z.input<typeof productSchema>, context: { requestId?: string } = {}) {
  const { organization, actor } = await managedBusiness(principal, organizationId);
  const input = productSchema.parse(raw);
  checkCategory(input.category);
  await checkOrderable({ orderable: input.orderable ?? false, gstRatePercent: input.gstRatePercent ?? null, priceMinor: input.priceMinor ?? null }, null);
  const base = slugify(input.name) || 'product';
  const id = newId('product');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await db().product.create({
        data: {
          id,
          organizationId,
          kind: input.kind,
          category: input.category,
          name: input.name,
          slug: attempt === 0 ? base : `${base}-${attempt + 1}`,
          brand: input.brand ?? null,
          description: input.description ?? null,
          unit: input.unit ?? null,
          priceMinor: input.priceMinor ?? null,
          currency: input.priceMinor != null ? organization.currency : null,
          gstRatePercent: input.gstRatePercent ?? null,
          minOrderQuantity: input.minOrderQuantity ?? 1,
          orderable: input.orderable ?? false,
          taxCode: input.taxCode ?? null,
        },
      });
      await recordAuditEvent({ action: 'PRODUCT_CREATED', actor, subject: id, outcome: 'success', organizationId, requestId: context.requestId });
      return { productId: id };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw errors.conflict('Several products already have that name. Choose a more specific one.');
}

export async function updateProduct(principal: Principal, productId: string, raw: z.input<typeof productUpdateSchema>, context: { requestId?: string } = {}) {
  const product = await db().product.findUnique({ where: { id: productId } });
  if (!product) throw errors.notFound('Product');
  const { organization, actor } = await managedBusiness(principal, product.organizationId);
  const input = productUpdateSchema.parse(raw);
  if (input.category) checkCategory(input.category);
  await checkOrderable(
    {
      orderable: input.orderable ?? product.orderable,
      gstRatePercent: input.gstRatePercent !== undefined ? input.gstRatePercent : product.gstRatePercent,
      priceMinor: input.priceMinor !== undefined ? input.priceMinor : product.priceMinor,
    },
    productId,
  );
  if (input.status === 'PUBLISHED' && organization.status === 'SUSPENDED') throw errors.preconditionFailed('A suspended business cannot publish.');
  const updated = await db().product.update({
    where: { id: productId },
    data: { ...input, ...(input.priceMinor !== undefined ? { currency: input.priceMinor === null ? null : organization.currency } : {}) },
  });
  await recordAuditEvent({ action: 'PRODUCT_UPDATED', actor, subject: productId, outcome: 'success', organizationId: product.organizationId, requestId: context.requestId, detail: { status: input.status ?? null } });
  return updated;
}

export async function businessConsole(principal: Principal, organizationId: string) {
  const { organization } = await managedBusiness(principal, organizationId);
  const [profile, products] = await Promise.all([
    db().businessProfile.findUnique({ where: { organizationId }, include: { serviceAreas: { include: { district: { select: { name: true } } } } } }),
    db().product.findMany({ where: { organizationId }, include: { _count: { select: { quoteRequests: true, orderLines: true } }, variants: { orderBy: [{ status: 'asc' }, { label: 'asc' }] } }, orderBy: [{ status: 'asc' }, { name: 'asc' }] }),
  ]);
  return { organization, profile, products };
}

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------

const LISTED_SELLER = { deletedAt: null, type: { in: [...BUSINESS_TYPES] }, status: { in: ['ACTIVE' as const, 'PENDING' as const] }, ownerUserId: { not: null } };

export async function listPublicProducts(filter: { category?: string; districtId?: string; q?: string } = {}) {
  const q = filter.q?.trim();
  return db().product.findMany({
    where: {
      status: 'PUBLISHED',
      ...(filter.category ? { category: filter.category } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }] } : {}),
      organization: {
        ...LISTED_SELLER,
        ...(filter.districtId ? { businessProfile: { OR: [{ servesAllIndia: true }, { serviceAreas: { some: { districtId: filter.districtId } } }] } } : {}),
      },
    },
    include: { organization: { select: { name: true, slug: true, type: true, verifiedAt: true, verificationExpires: true } } },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
  });
}

export async function getPublicBusiness(slug: string) {
  const business = await db().organization.findFirst({
    where: { slug, deletedAt: null, type: { in: [...BUSINESS_TYPES] }, status: { in: ['ACTIVE', 'PENDING'] } },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      description: true,
      website: true,
      verifiedAt: true,
      verificationExpires: true,
      ownerUserId: true,
      businessProfile: { include: { serviceAreas: { include: { district: { select: { name: true, region: { select: { name: true } } } } } } } },
      products: { where: { status: 'PUBLISHED' }, include: { variants: { where: { status: 'ACTIVE' }, orderBy: { label: 'asc' } } }, orderBy: [{ category: 'asc' }, { name: 'asc' }] },
      locations: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' }, take: 1, select: { district: { select: { name: true, region: { select: { name: true } } } }, address: { select: { locality: true } } } },
    },
  });
  if (!business) return null;
  const now = new Date();
  const claimed = business.ownerUserId !== null;
  return { ...business, products: claimed ? business.products : [], isClaimed: claimed, isVerified: business.verifiedAt !== null && (business.verificationExpires === null || business.verificationExpires > now) };
}

// ---------------------------------------------------------------------------
// Quote requests
// ---------------------------------------------------------------------------

export const quoteRequestSchema = z.object({
  quantity: z.number().int().min(1).max(1_000_000),
  message: z.string().trim().max(1000).optional(),
  deliveryDistrictId: z.string().max(64).optional(),
  buyerOrganizationId: z.string().max(64).optional(),
});

export async function requestQuote(principal: Principal, productId: string, raw: z.input<typeof quoteRequestSchema>, context: { requestId?: string } = {}) {
  const me = signedIn(principal);
  const input = quoteRequestSchema.parse(raw);
  const buyer = await db().user.findUnique({ where: { id: me.userId }, select: { emailVerifiedAt: true, status: true } });
  if (!buyer || buyer.status !== 'ACTIVE') throw errors.unauthenticated();
  if (!buyer.emailVerifiedAt) throw errors.preconditionFailed('Verify your email address first, so the seller can reply to you.');
  const product = await db().product.findFirst({ where: { id: productId, status: 'PUBLISHED', organization: LISTED_SELLER }, select: { id: true, name: true, organizationId: true, minOrderQuantity: true } });
  if (!product) throw errors.notFound('Product');
  if (input.quantity < product.minOrderQuantity) throw errors.validation(`The minimum order is ${product.minOrderQuantity}.`, { field: 'quantity' });
  const member = await db().organizationMember.count({ where: { organizationId: product.organizationId, userId: me.userId, leftAt: null } });
  if (member > 0) throw errors.preconditionFailed('You work for this business, so you cannot ask it for a quote.');
  if (input.buyerOrganizationId) {
    const buysFor = await db().organizationMember.count({ where: { organizationId: input.buyerOrganizationId, userId: me.userId, leftAt: null } });
    if (buysFor === 0) throw errors.validation('You can only ask on behalf of an organization you belong to.', { field: 'buyerOrganizationId' });
  }
  if (input.deliveryDistrictId && !(await db().district.findUnique({ where: { id: input.deliveryDistrictId }, select: { id: true } }))) throw errors.validation('That district does not exist.', { field: 'deliveryDistrictId' });

  const id = newId('rfq');
  try {
    await transaction(async (tx) => {
      await tx.quoteRequest.create({
        data: {
          id,
          sellerOrganizationId: product.organizationId,
          productId: product.id,
          buyerUserId: me.userId,
          buyerOrganizationId: input.buyerOrganizationId ?? null,
          quantity: input.quantity,
          message: input.message ?? null,
          deliveryDistrictId: input.deliveryDistrictId ?? null,
          openKey: `${me.userId}:${product.id}`,
        },
      });
      await tx.quoteEvent.create({ data: { id: newId('quoteEvent'), quoteRequestId: id, action: 'REQUESTED', toStatus: 'NEW', actorUserId: me.userId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('You already have an open quote request for this product.');
    throw error;
  }
  await recordAuditEvent({ action: 'QUOTE_REQUESTED', actor: me.userId, subject: id, outcome: 'success', organizationId: product.organizationId, requestId: context.requestId });
  await notifyOrganizationAdmins({ organizationId: product.organizationId, notificationId: 'TL-NOTIF-QUOTE-REQUEST-001', data: { summary: `New quote request: ${input.quantity} × ${product.name}.` }, linkUrl: `/account/organizations/${product.organizationId}/quotes` });
  return { quoteRequestId: id };
}

const when = z.string().datetime({ offset: true });
export const quoteActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('QUOTE'), priceMinor: price, validUntil: when, note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.enum(['DECLINE', 'WITHDRAW', 'ACCEPT', 'CLOSE']), note: z.string().trim().max(1000).optional() }),
]);

export async function actOnQuote(principal: Principal, quoteRequestId: string, raw: z.input<typeof quoteActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = quoteActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const quote = await db().quoteRequest.findUnique({ where: { id: quoteRequestId }, include: { product: { select: { name: true } }, seller: { select: { name: true, currency: true } } } });
  if (!quote) throw errors.notFound('Quote request');
  const scope = { organizationId: quote.sellerOrganizationId };
  const isBuyer = quote.buyerUserId === me.userId;
  const sellerManages = can(me, QUOTE_MANAGE, scope);
  const sellerReads = can(me, QUOTE_READ, scope);
  const buyerAction = input.action === 'ACCEPT' || input.action === 'WITHDRAW';
  if (buyerAction ? !isBuyer : !sellerManages) throw !buyerAction && sellerReads ? errors.forbidden(QUOTE_MANAGE) : errors.notFound('Quote request');

  const item = quote.product?.name ?? 'your request';
  let to: QuoteStatus;
  let from: QuoteStatus[];
  let data: Prisma.QuoteRequestUpdateManyMutationInput = {};
  let tell: { userId?: string; organizationId?: string; summary: string } | null = null;
  switch (input.action) {
    case 'QUOTE': {
      const valid = new Date(input.validUntil);
      if (valid.getTime() <= now.getTime() || valid.getTime() > now.getTime() + 90 * DAY) throw errors.validation('A quote is valid from now for up to 90 days.', { field: 'validUntil' });
      from = ['NEW', 'QUOTED'];
      to = 'QUOTED';
      data = { quotedPriceMinor: input.priceMinor, currency: quote.seller.currency, validUntil: valid, sellerNote: input.note ?? null, respondedAt: now };
      tell = { userId: quote.buyerUserId, summary: `${quote.seller.name} sent a quote for ${item}.` };
      break;
    }
    case 'DECLINE':
      if (!input.note) throw errors.validation('Tell the buyer why.', { field: 'note' });
      from = OPEN;
      to = 'DECLINED';
      data = { sellerNote: input.note, decidedAt: now };
      tell = { userId: quote.buyerUserId, summary: `${quote.seller.name} cannot quote for ${item}: ${input.note}` };
      break;
    case 'ACCEPT':
      if (quote.status === 'QUOTED' && quote.validUntil && quote.validUntil <= now) throw errors.preconditionFailed('This quote has expired. Ask the seller for a new one.');
      from = ['QUOTED'];
      to = 'ACCEPTED';
      data = { decidedAt: now };
      tell = { organizationId: quote.sellerOrganizationId, summary: `Your quote for ${item} was accepted. Arrange payment and delivery with the buyer.` };
      break;
    case 'WITHDRAW':
      from = OPEN;
      to = 'WITHDRAWN';
      data = { decidedAt: now };
      break;
    case 'CLOSE':
      from = ['ACCEPTED'];
      to = 'CLOSED';
      break;
  }
  const VERB = { QUOTE: 'quoted', DECLINE: 'declined', ACCEPT: 'accepted', WITHDRAW: 'withdrawn', CLOSE: 'closed' } as const;
  if (!from.includes(quote.status)) throw errors.preconditionFailed(`A request that is “${QUOTE_STATUS_LABEL[quote.status].toLowerCase()}” cannot be ${VERB[input.action]}.`);
  const closing = !OPEN.includes(to);
  await transaction(async (tx) => {
    const claim = await tx.quoteRequest.updateMany({ where: { id: quoteRequestId, status: quote.status }, data: { ...data, status: to, ...(closing ? { openKey: null } : {}) } });
    if (claim.count === 0) throw errors.conflict('This request changed while you were acting on it. Refresh and try again.');
    await tx.quoteEvent.create({ data: { id: newId('quoteEvent'), quoteRequestId, action: input.action, fromStatus: quote.status, toStatus: to, actorUserId: me.userId, note: input.note ?? null } });
  });
  await recordAuditEvent({ action: `QUOTE_${input.action}`, actor: me.userId, subject: quoteRequestId, outcome: 'success', organizationId: quote.sellerOrganizationId, requestId: context.requestId });
  if (tell?.userId) await notifyUser({ userId: tell.userId, notificationId: 'TL-NOTIF-QUOTE-UPDATE-001', data: { summary: tell.summary }, linkUrl: '/account/quotes' });
  if (tell?.organizationId) await notifyOrganizationAdmins({ organizationId: tell.organizationId, notificationId: 'TL-NOTIF-QUOTE-REQUEST-001', data: { summary: tell.summary }, linkUrl: `/account/organizations/${tell.organizationId}/quotes` });
  return { status: to };
}

/** Quotes past their validity become EXPIRED (a scheduled job); an expired quote was never accepted. */
export async function expireQuotes(now: Date = new Date()): Promise<number> {
  const due = await db().quoteRequest.findMany({ where: { status: 'QUOTED', validUntil: { lte: now } }, select: { id: true }, take: 500 });
  let expired = 0;
  for (const { id } of due) {
    const done = await transaction(async (tx) => {
      const claim = await tx.quoteRequest.updateMany({ where: { id, status: 'QUOTED', validUntil: { lte: now } }, data: { status: 'EXPIRED', openKey: null, decidedAt: now } });
      if (claim.count === 0) return false;
      await tx.quoteEvent.create({ data: { id: newId('quoteEvent'), quoteRequestId: id, action: 'EXPIRE', fromStatus: 'QUOTED', toStatus: 'EXPIRED' } });
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}

export async function listSellerQuotes(principal: Principal, organizationId: string, filter: { status?: QuoteStatus } = {}) {
  if (!isAuthenticated(principal) || !can(principal, QUOTE_READ, { organizationId })) throw errors.notFound('Organization');
  return db().quoteRequest.findMany({
    where: { sellerOrganizationId: organizationId, ...(filter.status ? { status: filter.status } : {}) },
    include: {
      product: { select: { name: true, unit: true } },
      buyer: { select: { displayName: true, email: true, phone: true } },
      buyerOrganization: { select: { name: true } },
      deliveryDistrict: { select: { name: true } },
      events: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
}

export async function sellerQuoteStats(principal: Principal, organizationId: string) {
  if (!isAuthenticated(principal) || !can(principal, QUOTE_READ, { organizationId })) throw errors.notFound('Organization');
  const rows = await db().quoteRequest.groupBy({ by: ['status'], where: { sellerOrganizationId: organizationId }, _count: true });
  const count = (s: QuoteStatus) => rows.find((r) => r.status === s)?._count ?? 0;
  const total = rows.reduce((n, r) => n + r._count, 0);
  const won = count('ACCEPTED') + count('CLOSED');
  return { total, open: count('NEW') + count('QUOTED'), waiting: count('NEW'), won, byStatus: Object.fromEntries(rows.map((r) => [r.status, r._count])) as Partial<Record<QuoteStatus, number>>, winRate: total > 0 ? Math.round((won / total) * 1000) / 10 : null };
}

export async function myQuoteRequests(principal: Principal) {
  const me = signedIn(principal);
  return db().quoteRequest.findMany({
    where: { buyerUserId: me.userId },
    include: { product: { select: { name: true, unit: true } }, seller: { select: { name: true, slug: true, phone: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
