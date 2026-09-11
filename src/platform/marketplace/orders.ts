/**
 * TOOTHLOGY MARKETPLACE ORDERS — cart, checkout, fulfilment, tax documents, returns
 *
 * CART → ORDER to one seller (PLACED) → seller CONFIRMS (or declines) →
 * buyer pays the seller directly, and the seller RECORDS what it received →
 * DISPATCHED (tax invoice issued) → DELIVERED → a return within the seller's
 * window → approved → received (credit note issued) → refund recorded.
 *
 * - Only published products the seller marked orderable, from businesses
 *   someone manages, at the listed tax-inclusive price (or the variant's) and
 *   the product's tax rate. Prices are frozen on the order lines.
 * - No money moves through Toothlogy. Online payment goes through the payment
 *   port, which answers NOT_CONFIGURED until a provider is connected. An order
 *   is only ever marked paid by the seller recording what it received — shown
 *   to the buyer as the seller's record (Constitution P10).
 * - Tax documents come from the seller's country tax pack, are numbered without
 *   gaps per seller, kind and fiscal year, and are frozen once issued.
 */

import { z } from 'zod';
import { Prisma, type OrderPaymentStatus, type OrderStatus, type ProductStatus, type ReturnStatus, type TaxDocumentKind, type VariantStatus } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { notifyOrganizationAdmins, notifyUser } from '../notifications';
import { emitInTransaction } from '../events/outbox';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { formatMoney } from '../money';
import { paymentProvider } from '../payments/ports';
import { BUSINESS_TYPES } from '../catalogue/marketplace';
import { lineAmounts, taxPackFor, totalByComponent } from '../tax/packs';

const CATALOGUE = 'tl.marketplace.catalogue.manage';
const ORDER_READ = 'tl.marketplace.order.read';
const ORDER_MANAGE = 'tl.marketplace.order.manage';
const DAY = 86_400_000;
const ZERO = BigInt(0);
const MAX_CART_LINES = 50;
const LISTED_SELLER = { deletedAt: null, type: { in: [...BUSINESS_TYPES] }, status: { in: ['ACTIVE' as const, 'PENDING' as const] }, ownerUserId: { not: null } };
type Tx = Prisma.TransactionClient;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: 'Waiting for the seller',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DECLINED: 'Declined by the seller',
};
export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: 'Not paid',
  PARTLY_PAID: 'Part paid',
  PAID: 'Paid',
  PARTLY_REFUNDED: 'Part refunded',
  REFUNDED: 'Refunded',
};
export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Return requested',
  APPROVED: 'Return approved: send the items back',
  REJECTED: 'Return declined',
  RECEIVED: 'Items received by the seller',
  REFUNDED: 'Refunded',
  CANCELLED: 'Return cancelled',
};
export const PAYMENT_METHOD_LABEL = {
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  CARD_ON_DELIVERY: 'Card on delivery',
  OTHER: 'Other',
} as const;
export const RETURN_REASON_LABEL = {
  DAMAGED: 'Arrived damaged',
  WRONG_ITEM: 'Wrong item sent',
  NOT_AS_DESCRIBED: 'Not as described',
  EXPIRED: 'Expired or near expiry',
  OTHER: 'Other',
} as const;

const money = (amountMinor: bigint, currency: string) => formatMoney({ amountMinor, currency }, 'en-IN');

function signedIn(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return principal;
}

/** Validate with a schema; failures become VALIDATION_FAILED naming the field. */
function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw errors.validation(issue?.message ?? 'Check the details and try again.', issue?.path.length ? { field: issue.path.map(String).join('.') } : undefined);
  }
  return result.data;
}

const isUnique = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
const amount = z
  .union([z.string().regex(/^\d{1,12}$/, 'Enter the amount in the smallest unit (paise), digits only.'), z.number().int().min(0).max(1e12), z.bigint().min(BigInt(0)).max(BigInt(1e12))])
  .transform((v) => BigInt(v));

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export const variantSchema = z.object({
  label: z.string().trim().min(1, 'Name the variant, for example “Size M”.').max(60),
  sku: z.string().trim().max(40).nullable().optional(),
  priceMinor: amount,
  available: z.boolean().optional(),
});
export const variantUpdateSchema = variantSchema.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() });

async function sellerProduct(principal: Principal, productId: string) {
  const product = await db().product.findUnique({ where: { id: productId }, select: { id: true, organizationId: true } });
  if (!product || !isAuthenticated(principal) || !can(principal, CATALOGUE, { organizationId: product.organizationId })) throw errors.notFound('Product');
  return { product, actor: principal.userId };
}

export async function createVariant(principal: Principal, productId: string, raw: z.input<typeof variantSchema>, context: { requestId?: string } = {}) {
  const { product, actor } = await sellerProduct(principal, productId);
  const input = parse(variantSchema, raw);
  if ((await db().productVariant.count({ where: { productId, status: 'ACTIVE' } })) >= 30) throw errors.preconditionFailed('A product can have up to 30 variants on sale.');
  const id = newId('variant');
  try {
    await db().productVariant.create({ data: { id, productId, label: input.label, sku: input.sku ?? null, priceMinor: input.priceMinor, available: input.available ?? true } });
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('This product already has a variant with that name.');
    throw error;
  }
  await recordAuditEvent({ action: 'VARIANT_CREATED', actor, subject: id, outcome: 'success', organizationId: product.organizationId, requestId: context.requestId });
  return { variantId: id };
}

export async function updateVariant(principal: Principal, variantId: string, raw: z.input<typeof variantUpdateSchema>, context: { requestId?: string } = {}) {
  const variant = await db().productVariant.findUnique({ where: { id: variantId }, select: { productId: true } });
  if (!variant) throw errors.notFound('Variant');
  const { product, actor } = await sellerProduct(principal, variant.productId);
  const input = parse(variantUpdateSchema, raw);
  try {
    const updated = await db().productVariant.update({ where: { id: variantId }, data: input });
    await recordAuditEvent({ action: 'VARIANT_UPDATED', actor, subject: variantId, outcome: 'success', organizationId: product.organizationId, requestId: context.requestId, detail: { status: input.status ?? null } });
    return updated;
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('This product already has a variant with that name.');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Pricing a line
// ---------------------------------------------------------------------------

interface ForSale {
  readonly status: ProductStatus;
  readonly orderable: boolean;
  readonly gstRatePercent: number | null;
  readonly priceMinor: bigint | null;
  readonly variants: ReadonlyArray<{ id: string; label: string; sku: string | null; priceMinor: bigint; available: boolean; status: VariantStatus }>;
}
export type PricedLine = { ok: true; unitPriceMinor: bigint; variantLabel: string | null; sku: string | null } | { ok: false; problem: string; field?: string };

/**
 * What one unit of a product (or its variant) sells for now, or why it cannot
 * be ordered. A product with variants on sale is ordered by variant.
 */
export function priceLine(product: ForSale, variantId: string | null): PricedLine {
  if (product.status !== 'PUBLISHED' || !product.orderable) return { ok: false, problem: 'No longer sold at a listed price' };
  if (product.gstRatePercent === null) return { ok: false, problem: 'The seller has not set its tax rate' };
  const onSale = product.variants.filter((v) => v.status === 'ACTIVE');
  if (onSale.length > 0) {
    if (!variantId) return { ok: false, problem: 'Choose a variant', field: 'variantId' };
    const variant = onSale.find((v) => v.id === variantId);
    if (!variant) return { ok: false, problem: 'That variant is no longer sold', field: 'variantId' };
    if (!variant.available) return { ok: false, problem: `${variant.label} is out of stock`, field: 'variantId' };
    return { ok: true, unitPriceMinor: variant.priceMinor, variantLabel: variant.label, sku: variant.sku };
  }
  if (variantId) return { ok: false, problem: 'That variant is no longer sold', field: 'variantId' };
  if (product.priceMinor === null) return { ok: false, problem: 'No listed price: ask the seller for a quote' };
  return { ok: true, unitPriceMinor: product.priceMinor, variantLabel: null, sku: null };
}

const PRODUCT_FOR_SALE = {
  select: {
    id: true,
    name: true,
    unit: true,
    taxCode: true,
    priceMinor: true,
    gstRatePercent: true,
    minOrderQuantity: true,
    status: true,
    orderable: true,
    organizationId: true,
    organization: { select: { id: true, name: true, slug: true, currency: true, deletedAt: true, status: true, ownerUserId: true } },
    variants: { select: { id: true, label: true, sku: true, priceMinor: true, available: true, status: true }, orderBy: { label: 'asc' as const } },
  },
} as const;

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export const cartItemSchema = z.object({
  productId: z.string().max(64),
  variantId: z.string().max(64).nullable().optional(),
  quantity: z.number({ error: 'Enter a quantity.' }).int('Enter a whole number.').min(1, 'Enter a quantity of at least 1.').max(1_000_000),
});

export async function setCartItem(principal: Principal, raw: z.input<typeof cartItemSchema>) {
  const me = signedIn(principal);
  const input = parse(cartItemSchema, raw);
  const product = await db().product.findFirst({ where: { id: input.productId, status: 'PUBLISHED', organization: LISTED_SELLER }, ...PRODUCT_FOR_SALE });
  if (!product) throw errors.notFound('Product');
  if (!product.orderable) throw errors.preconditionFailed('This item is sold on quotation. Ask the seller for a quote.');
  const priced = priceLine(product, input.variantId ?? null);
  if (!priced.ok) throw priced.field ? errors.validation(`${priced.problem}.`, { field: priced.field }) : errors.preconditionFailed(`${priced.problem}.`);
  if (input.quantity < product.minOrderQuantity) throw errors.validation(`The minimum order is ${product.minOrderQuantity}.`, { field: 'quantity' });
  if ((await db().organizationMember.count({ where: { organizationId: product.organizationId, userId: me.userId, leftAt: null } })) > 0) {
    throw errors.preconditionFailed('You work for this business, so you cannot order from it.');
  }
  const lineKey = `${me.userId}:${product.id}:${input.variantId ?? '-'}`;
  const existing = await db().cartItem.findUnique({ where: { lineKey }, select: { id: true } });
  if (!existing && (await db().cartItem.count({ where: { userId: me.userId } })) >= MAX_CART_LINES) throw errors.preconditionFailed(`A cart holds up to ${MAX_CART_LINES} lines.`);
  const item = await db().cartItem.upsert({
    where: { lineKey },
    create: { id: newId('cart'), userId: me.userId, productId: product.id, variantId: input.variantId ?? null, quantity: input.quantity, lineKey },
    update: { quantity: input.quantity },
  });
  return { cartItemId: item.id, quantity: item.quantity };
}

export async function removeCartItem(principal: Principal, cartItemId: string) {
  const me = signedIn(principal);
  const removed = await db().cartItem.deleteMany({ where: { id: cartItemId, userId: me.userId } });
  if (removed.count === 0) throw errors.notFound('Cart line');
  return { removed: true };
}

export interface CartLineView {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly name: string;
  readonly variantLabel: string | null;
  readonly unit: string | null;
  readonly quantity: number;
  readonly minimum: number;
  readonly unitPriceMinor: bigint | null;
  readonly grossMinor: bigint | null;
  readonly problem: string | null;
}

/** The buyer's cart, grouped by seller: each group becomes one order. */
export async function myCart(principal: Principal) {
  const me = signedIn(principal);
  const items = await db().cartItem.findMany({ where: { userId: me.userId }, include: { product: PRODUCT_FOR_SALE }, orderBy: { createdAt: 'asc' } });
  const groups = new Map<string, { seller: { id: string; name: string; slug: string }; currency: string; lines: CartLineView[]; totalMinor: bigint; problems: number }>();
  for (const item of items) {
    const seller = item.product.organization;
    const listed = seller.deletedAt === null && seller.ownerUserId !== null && (seller.status === 'ACTIVE' || seller.status === 'PENDING');
    const priced: PricedLine = listed ? priceLine(item.product, item.variantId) : { ok: false, problem: 'The seller is not selling on Toothlogy now' };
    const unitPriceMinor = priced.ok ? priced.unitPriceMinor : null;
    const problem = !priced.ok ? priced.problem : item.quantity < item.product.minOrderQuantity ? `The minimum order is ${item.product.minOrderQuantity}` : null;
    const line: CartLineView = {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      variantLabel: priced.ok ? priced.variantLabel : (item.product.variants.find((v) => v.id === item.variantId)?.label ?? null),
      unit: item.product.unit,
      quantity: item.quantity,
      minimum: item.product.minOrderQuantity,
      unitPriceMinor,
      grossMinor: unitPriceMinor === null ? null : unitPriceMinor * BigInt(item.quantity),
      problem,
    };
    const group = groups.get(seller.id) ?? { seller: { id: seller.id, name: seller.name, slug: seller.slug }, currency: seller.currency, lines: [], totalMinor: ZERO, problems: 0 };
    group.lines.push(line);
    group.totalMinor += line.grossMinor ?? ZERO;
    group.problems += problem ? 1 : 0;
    groups.set(seller.id, group);
  }
  return { sellers: [...groups.values()], lineCount: items.length };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  sellerOrganizationId: z.string().max(64),
  buyerOrganizationId: z.string().max(64).optional(),
  deliveryName: z.string().trim().min(2, 'Who should receive the order?').max(120),
  deliveryPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a phone number for delivery.'),
  deliveryAddress: z.string().trim().min(10, 'Enter the full delivery address.').max(500),
  deliveryDistrictId: z.string().min(1, 'Choose the delivery district.').max(64),
  buyerTaxIdentifier: z.string().trim().toUpperCase().max(20).optional(),
  buyerNote: z.string().trim().max(1000).optional(),
});

/** Place the order for everything in the cart from one seller. */
export async function placeOrder(principal: Principal, raw: z.input<typeof checkoutSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = signedIn(principal);
  const input = parse(checkoutSchema, raw);
  const now = context.now ?? new Date();
  const buyer = await db().user.findUnique({ where: { id: me.userId }, select: { emailVerifiedAt: true, status: true } });
  if (!buyer || buyer.status !== 'ACTIVE') throw errors.unauthenticated();
  if (!buyer.emailVerifiedAt) throw errors.preconditionFailed('Verify your email address first, so the seller can reach you about the order.');
  if (input.buyerOrganizationId && (await db().organizationMember.count({ where: { organizationId: input.buyerOrganizationId, userId: me.userId, leftAt: null } })) === 0) {
    throw errors.validation('You can only order for an organization you belong to.', { field: 'buyerOrganizationId' });
  }
  const seller = await db().organization.findFirst({
    where: { id: input.sellerOrganizationId, ...LISTED_SELLER },
    select: { id: true, name: true, currency: true, countryCode: true, businessProfile: { select: { servesAllIndia: true, serviceAreas: { select: { districtId: true } } } } },
  });
  if (!seller) throw errors.notFound('Seller');
  const district = await db().district.findUnique({ where: { id: input.deliveryDistrictId }, select: { id: true, name: true, countryCode: true } });
  if (!district) throw errors.validation('Choose the delivery district.', { field: 'deliveryDistrictId' });
  const serves = district.countryCode === seller.countryCode && (seller.businessProfile?.servesAllIndia || seller.businessProfile?.serviceAreas.some((a) => a.districtId === district.id));
  if (!serves) throw errors.validation(`${seller.name} does not deliver to ${district.name}.`, { field: 'deliveryDistrictId' });
  const country = await db().country.findUnique({ where: { code: seller.countryCode }, select: { taxRegime: true } });
  if (!country) throw errors.preconditionFailed('This seller’s country is not set up for orders.');
  const pack = taxPackFor(country.taxRegime);
  if (input.buyerTaxIdentifier && !pack.validTaxIdentifier(input.buyerTaxIdentifier)) {
    throw errors.validation(`That is not a valid ${pack.taxIdentifierLabel ?? 'tax identifier'}.`, { field: 'buyerTaxIdentifier' });
  }

  const items = await db().cartItem.findMany({ where: { userId: me.userId, product: { organizationId: seller.id } }, include: { product: PRODUCT_FOR_SALE }, orderBy: { createdAt: 'asc' } });
  if (items.length === 0) throw errors.preconditionFailed(`Your cart has nothing from ${seller.name}.`);
  const lines = items.map((item) => {
    const priced = priceLine(item.product, item.variantId);
    if (!priced.ok) throw errors.preconditionFailed(`${item.product.name}: ${priced.problem}. Update your cart first.`);
    if (item.quantity < item.product.minOrderQuantity) throw errors.preconditionFailed(`${item.product.name}: the minimum order is ${item.product.minOrderQuantity}. Update your cart first.`);
    const rate = item.product.gstRatePercent! * 100;
    return {
      id: newId('orderLine'),
      productId: item.productId,
      variantId: item.variantId,
      name: item.product.name,
      variantLabel: priced.variantLabel,
      sku: priced.sku,
      unit: item.product.unit,
      taxCode: item.product.taxCode,
      quantity: item.quantity,
      unitPriceMinor: priced.unitPriceMinor,
      taxRateBasisPoints: rate,
      ...lineAmounts(priced.unitPriceMinor, item.quantity, rate),
    };
  });
  const subtotalMinor = lines.reduce((n, l) => n + l.netMinor, ZERO);
  const taxMinor = lines.reduce((n, l) => n + l.taxMinor, ZERO);
  const totalMinor = subtotalMinor + taxMinor;
  const orderId = newId('order');
  const number = `TLO-${orderId.slice(-10)}`;

  await transaction(async (tx) => {
    await tx.order.create({
      data: {
        id: orderId,
        number,
        sellerOrganizationId: seller.id,
        buyerUserId: me.userId,
        buyerOrganizationId: input.buyerOrganizationId ?? null,
        currency: seller.currency,
        subtotalMinor,
        taxMinor,
        totalMinor,
        deliveryName: input.deliveryName,
        deliveryPhone: input.deliveryPhone,
        deliveryAddress: input.deliveryAddress,
        deliveryDistrictId: district.id,
        buyerTaxIdentifier: input.buyerTaxIdentifier || null,
        buyerNote: input.buyerNote || null,
        placedAt: now,
        lines: { createMany: { data: lines } },
      },
    });
    await tx.orderEvent.create({ data: { id: newId('orderEvent'), orderId, action: 'PLACED', toStatus: 'PLACED', actorUserId: me.userId } });
    // The cart lines become the order: a retried checkout finds them gone.
    const taken = await tx.cartItem.deleteMany({ where: { id: { in: items.map((i) => i.id) }, userId: me.userId } });
    if (taken.count !== items.length) throw errors.conflict('Your cart changed while you were ordering. Check it and try again.');
    await emitInTransaction(tx, 'ORDER_CREATED', { orderId, sellerOrganizationId: seller.id }, { requestId: context.requestId ?? null, actor: me.userId });
  });
  await recordAuditEvent({ action: 'ORDER_PLACED', actor: me.userId, subject: orderId, outcome: 'success', organizationId: seller.id, requestId: context.requestId, detail: { lines: lines.length } });
  await notifyOrganizationAdmins({ organizationId: seller.id, notificationId: 'TL-NOTIF-ORDER-RECEIVED-001', data: { summary: `New order ${number}: ${lines.length} ${lines.length === 1 ? 'item' : 'items'}, ${money(totalMinor, seller.currency)}.` }, linkUrl: `/orders/${orderId}` });
  await notifyUser({ userId: me.userId, notificationId: 'TL-NOTIF-ORDER-CONFIRMATION-001', data: { orderNumber: number, total: money(totalMinor, seller.currency) }, linkUrl: `/orders/${orderId}` });
  return { orderId, number, totalMinor };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/** The order as the caller may see it: its buyer, or the seller's people. Anyone else: not found. */
async function loadOrder(principal: Principal, orderId: string) {
  const me = signedIn(principal);
  const order = await db().order.findUnique({ where: { id: orderId }, include: { seller: { select: { id: true, name: true } } } });
  if (!order) throw errors.notFound('Order');
  const scope = { organizationId: order.sellerOrganizationId };
  const isBuyer = order.buyerUserId === me.userId;
  const sellerReads = can(me, ORDER_READ, scope);
  const sellerManages = can(me, ORDER_MANAGE, scope);
  if (!isBuyer && !sellerReads) throw errors.notFound('Order');
  return { me, order, isBuyer, sellerReads, sellerManages };
}

function tellBuyer(order: { buyerUserId: string; id: string; number: string }, change: string) {
  return notifyUser({ userId: order.buyerUserId, notificationId: 'TL-NOTIF-ORDER-UPDATE-001', data: { orderNumber: order.number, change }, linkUrl: `/orders/${order.id}` });
}
function tellSeller(order: { sellerOrganizationId: string; id: string }, summary: string) {
  return notifyOrganizationAdmins({ organizationId: order.sellerOrganizationId, notificationId: 'TL-NOTIF-ORDER-RECEIVED-001', data: { summary }, linkUrl: `/orders/${order.id}` });
}

// ---------------------------------------------------------------------------
// Tax documents
// ---------------------------------------------------------------------------

interface DocumentLine {
  readonly name: string;
  readonly variantLabel: string | null;
  readonly taxCode: string | null;
  readonly unit: string | null;
  readonly quantity: number;
  readonly unitPriceMinor: bigint;
  readonly rateBasisPoints: number;
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly grossMinor: bigint;
}

async function sellerTaxProfile(tx: Tx, sellerOrganizationId: string) {
  const seller = await tx.organization.findUniqueOrThrow({
    where: { id: sellerOrganizationId },
    select: {
      name: true,
      countryCode: true,
      taxIdentifier: true,
      businessProfile: { select: { gstin: true } },
      address: { select: { lines: true, locality: true, regionName: true, city: { select: { region: { select: { name: true } } } } } },
      locations: {
        where: { deletedAt: null, districtId: { not: null } },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
        select: { address: { select: { lines: true, locality: true } }, district: { select: { name: true, region: { select: { name: true } } } } },
      },
    },
  });
  const country = await tx.country.findUnique({ where: { code: seller.countryCode }, select: { taxRegime: true } });
  const place = seller.locations[0];
  const region = place?.district?.region.name ?? seller.address?.city?.region.name ?? seller.address?.regionName ?? null;
  if (!region || !country) {
    throw errors.preconditionFailed('Add your business’s address with its district (under Locations) before issuing tax documents, so they show where you supply from.');
  }
  const address = [...(place?.address?.lines ?? seller.address?.lines ?? []), place?.address?.locality ?? seller.address?.locality, place?.district?.name].filter(Boolean).join(', ');
  return { name: seller.name, taxIdentifier: seller.businessProfile?.gstin ?? seller.taxIdentifier ?? null, region, address: address || null, regime: country.taxRegime };
}

/** The next number in the seller's gapless series; rolled back with the transaction that takes it. */
async function nextNumber(tx: Tx, sellerOrganizationId: string, kind: TaxDocumentKind, fiscalYear: string) {
  const rows = await tx.$queryRaw<Array<{ lastSequence: number }>>`
    INSERT INTO "tax_document_series" ("sellerOrganizationId", "kind", "fiscalYear", "lastSequence")
    VALUES (${sellerOrganizationId}, ${kind}::"TaxDocumentKind", ${fiscalYear}, 1)
    ON CONFLICT ("sellerOrganizationId", "kind", "fiscalYear")
    DO UPDATE SET "lastSequence" = "tax_document_series"."lastSequence" + 1
    RETURNING "lastSequence"`;
  const sequence = Number(rows[0]!.lastSequence);
  return { sequence, number: `${kind === 'INVOICE' ? 'INV' : 'CN'}${fiscalYear.replace(/\D/g, '')}-${String(sequence).padStart(5, '0')}` };
}

async function issueTaxDocument(
  tx: Tx,
  kind: TaxDocumentKind,
  order: { id: string; sellerOrganizationId: string; currency: string; deliveryName: string; deliveryAddress: string; deliveryDistrictId: string; buyerTaxIdentifier: string | null; buyerOrganizationId: string | null },
  lines: readonly DocumentLine[],
  returnRequestId: string | null,
  now: Date,
) {
  const seller = await sellerTaxProfile(tx, order.sellerOrganizationId);
  const pack = taxPackFor(seller.regime);
  const district = await tx.district.findUniqueOrThrow({ where: { id: order.deliveryDistrictId }, select: { name: true, region: { select: { name: true } } } });
  const buyerOrganization = order.buyerOrganizationId ? await tx.organization.findUnique({ where: { id: order.buyerOrganizationId }, select: { name: true } }) : null;
  const context = { sellerRegion: seller.region, placeOfSupply: district.region.name };
  const components = lines.map((l) => pack.split(l.taxMinor, l.rateBasisPoints, context));
  const fiscalYear = pack.fiscalYear(now);
  const { sequence, number } = await nextNumber(tx, order.sellerOrganizationId, kind, fiscalYear);
  const text = (n: bigint) => n.toString();
  const id = newId('taxDocument');
  await tx.taxDocument.create({
    data: {
      id,
      kind,
      number,
      sellerOrganizationId: order.sellerOrganizationId,
      orderId: order.id,
      invoiceKey: kind === 'INVOICE' ? order.id : null,
      returnRequestId,
      fiscalYear,
      sequence,
      issuedAt: now,
      currency: order.currency,
      taxRegime: seller.regime,
      sellerName: seller.name,
      sellerTaxIdentifier: seller.taxIdentifier,
      sellerAddress: seller.address,
      sellerRegion: seller.region,
      buyerName: buyerOrganization?.name ?? order.deliveryName,
      buyerTaxIdentifier: order.buyerTaxIdentifier,
      buyerAddress: `${order.deliveryAddress}, ${district.name}, ${district.region.name}`,
      placeOfSupply: district.region.name,
      supplyKind: pack.supplyKind(context),
      lines: lines.map((l, i) => ({
        name: l.name,
        variantLabel: l.variantLabel,
        taxCode: l.taxCode,
        unit: l.unit,
        quantity: l.quantity,
        unitPriceMinor: text(l.unitPriceMinor),
        rateBasisPoints: l.rateBasisPoints,
        netMinor: text(l.netMinor),
        taxMinor: text(l.taxMinor),
        grossMinor: text(l.grossMinor),
        components: components[i]!.map((c) => ({ label: c.label, rateBasisPoints: c.rateBasisPoints, amountMinor: text(c.amountMinor) })),
      })),
      taxBreakdown: totalByComponent(components).map((c) => ({ label: c.label, rateBasisPoints: c.rateBasisPoints, amountMinor: text(c.amountMinor) })),
      netMinor: lines.reduce((n, l) => n + l.netMinor, ZERO),
      taxMinor: lines.reduce((n, l) => n + l.taxMinor, ZERO),
      totalMinor: lines.reduce((n, l) => n + l.grossMinor, ZERO),
    },
  });
  return { taxDocumentId: id, number };
}

async function issueInvoice(tx: Tx, orderId: string, now: Date) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { orderBy: { id: 'asc' } } } });
  try {
    return await issueTaxDocument(
      tx,
      'INVOICE',
      order,
      order.lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, taxCode: l.taxCode, unit: l.unit, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, rateBasisPoints: l.taxRateBasisPoints, netMinor: l.netMinor, taxMinor: l.taxMinor, grossMinor: l.grossMinor })),
      null,
      now,
    );
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('An invoice has already been issued for this order.');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------

const note = z.string().trim().max(1000).optional();
export const orderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CONFIRM'), note }),
  z.object({ action: z.literal('DECLINE'), note: z.string().trim().min(3, 'Tell the buyer why.').max(1000) }),
  z.object({ action: z.literal('CANCEL'), note }),
  z.object({ action: z.literal('DISPATCH'), carrier: z.string().trim().max(80).optional(), trackingReference: z.string().trim().max(80).optional(), note }),
  z.object({ action: z.literal('DELIVERED') }),
  z.object({ action: z.literal('ISSUE_INVOICE') }),
]);

export async function actOnOrder(principal: Principal, orderId: string, raw: z.input<typeof orderActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const { me, order, isBuyer, sellerReads, sellerManages } = await loadOrder(principal, orderId);
  const input = parse(orderActionSchema, raw);
  const now = context.now ?? new Date();
  const buyerMay = isBuyer && (input.action === 'CANCEL' || input.action === 'DELIVERED');
  if (!buyerMay && !sellerManages) throw sellerReads ? errors.forbidden(ORDER_MANAGE) : errors.notFound('Order');
  const bySeller = !buyerMay;

  let from: OrderStatus[];
  let to: OrderStatus | null;
  let data: Prisma.OrderUpdateManyMutationInput = {};
  let invoice = false;
  let change: string | null = null;
  switch (input.action) {
    case 'CONFIRM':
      from = ['PLACED'];
      to = 'CONFIRMED';
      data = { confirmedAt: now, ...(input.note ? { sellerNote: input.note } : {}) };
      change = 'was confirmed by the seller. Pay the seller as it asks; the seller records your payment';
      break;
    case 'DECLINE':
      from = ['PLACED'];
      to = 'DECLINED';
      data = { sellerNote: input.note, closedAt: now };
      change = `was declined by the seller: ${input.note}`;
      break;
    case 'CANCEL':
      if (bySeller && !input.note) throw errors.validation('Tell the buyer why.', { field: 'note' });
      from = bySeller ? ['PLACED', 'CONFIRMED'] : ['PLACED'];
      to = 'CANCELLED';
      data = { cancelReason: input.note ?? null, closedAt: now };
      change = bySeller ? `was cancelled by the seller: ${input.note}` : null;
      break;
    case 'DISPATCH':
      from = ['CONFIRMED'];
      to = 'DISPATCHED';
      data = { dispatchedAt: now, carrier: input.carrier || null, trackingReference: input.trackingReference || null, ...(input.note ? { sellerNote: input.note } : {}) };
      invoice = (await db().taxDocument.count({ where: { invoiceKey: orderId } })) === 0;
      change = `was dispatched${input.carrier ? ` by ${input.carrier}` : ''}${input.trackingReference ? `, tracking ${input.trackingReference}` : ''}`;
      break;
    case 'DELIVERED':
      from = ['DISPATCHED'];
      to = 'DELIVERED';
      data = { deliveredAt: now };
      change = bySeller ? 'was marked delivered by the seller' : null;
      break;
    case 'ISSUE_INVOICE':
      from = ['CONFIRMED', 'DISPATCHED', 'DELIVERED'];
      to = null;
      invoice = true;
      change = 'has its tax invoice';
      break;
  }
  const VERB = { CONFIRM: 'confirmed', DECLINE: 'declined', CANCEL: 'cancelled', DISPATCH: 'dispatched', DELIVERED: 'marked delivered', ISSUE_INVOICE: 'invoiced' } as const;
  if (!from.includes(order.status)) {
    throw errors.preconditionFailed(`An order that is “${ORDER_STATUS_LABEL[order.status].toLowerCase()}” cannot be ${VERB[input.action]}.`);
  }

  const issued = await transaction(async (tx) => {
    if (to) {
      const claim = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { ...data, status: to } });
      if (claim.count === 0) throw errors.conflict('This order changed while you were acting on it. Refresh and try again.');
    }
    await tx.orderEvent.create({ data: { id: newId('orderEvent'), orderId, action: input.action, fromStatus: order.status, toStatus: to ?? order.status, actorUserId: me.userId, note: 'note' in input ? (input.note ?? null) : null } });
    return invoice ? issueInvoice(tx, orderId, now) : null;
  });
  await recordAuditEvent({ action: `ORDER_${input.action}`, actor: me.userId, subject: orderId, outcome: 'success', organizationId: order.sellerOrganizationId, requestId: context.requestId, detail: { invoice: issued?.number ?? null } });
  if (bySeller && change) await tellBuyer(order, change);
  if (!bySeller) await tellSeller(order, input.action === 'CANCEL' ? `Order ${order.number} was cancelled by the buyer.` : `The buyer received order ${order.number}.`);
  return { status: to ?? order.status, invoiceNumber: issued?.number ?? null };
}

// ---------------------------------------------------------------------------
// Payments — recorded by the seller, never taken by Toothlogy
// ---------------------------------------------------------------------------

export const orderPaymentSchema = z.object({
  kind: z.enum(['RECEIPT', 'REFUND']),
  method: z.enum(['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'CARD_ON_DELIVERY', 'OTHER']),
  amountMinor: amount,
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date it was paid.'),
  reference: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
  returnRequestId: z.string().max(64).optional(),
});

export function paymentStatusFor(totalMinor: bigint, paidMinor: bigint, refundedMinor: bigint): OrderPaymentStatus {
  if (refundedMinor > ZERO) return refundedMinor >= paidMinor ? 'REFUNDED' : 'PARTLY_REFUNDED';
  if (paidMinor === ZERO) return 'UNPAID';
  return paidMinor >= totalMinor ? 'PAID' : 'PARTLY_PAID';
}

export async function recordOrderPayment(principal: Principal, orderId: string, raw: z.input<typeof orderPaymentSchema>, context: { requestId?: string; now?: Date } = {}) {
  const { me, order, sellerReads, sellerManages } = await loadOrder(principal, orderId);
  if (!sellerManages) throw sellerReads ? errors.forbidden(ORDER_MANAGE) : errors.notFound('Order');
  const input = parse(orderPaymentSchema, raw);
  const now = context.now ?? new Date();
  if (input.amountMinor <= ZERO) throw errors.validation('Enter an amount.', { field: 'amountMinor' });
  const receivedOn = new Date(`${input.receivedOn}T00:00:00Z`);
  if (Number.isNaN(receivedOn.getTime()) || receivedOn.getTime() > now.getTime() + DAY || receivedOn.getTime() < order.placedAt.getTime() - 2 * DAY) {
    throw errors.validation('The date cannot be in the future or before the order was placed.', { field: 'receivedOn' });
  }
  let paid = order.paidMinor;
  let refunded = order.refundedMinor;
  let forReturn: { id: string } | null = null;
  if (input.kind === 'RECEIPT') {
    if (input.returnRequestId) throw errors.validation('A payment received is not for a return.', { field: 'returnRequestId' });
    if (order.status === 'PLACED' || order.status === 'DECLINED') throw errors.preconditionFailed('Confirm the order before recording a payment for it.');
    if (paid + input.amountMinor > order.totalMinor) throw errors.validation(`That is more than is due: ${money(order.totalMinor - paid, order.currency)} remains.`, { field: 'amountMinor' });
    paid += input.amountMinor;
  } else {
    if (refunded + input.amountMinor > paid) throw errors.validation(`You can refund at most what you received: ${money(paid - refunded, order.currency)}.`, { field: 'amountMinor' });
    if (input.returnRequestId) {
      const request = await db().returnRequest.findFirst({ where: { id: input.returnRequestId, orderId }, select: { id: true, status: true, refundMinor: true } });
      if (!request) throw errors.notFound('Return request');
      if (request.status !== 'RECEIVED') throw errors.preconditionFailed('Record the refund once the returned items are received.');
      if (input.amountMinor !== request.refundMinor) throw errors.validation(`The refund for this return is ${money(request.refundMinor, order.currency)}.`, { field: 'amountMinor' });
      forReturn = request;
    }
    refunded += input.amountMinor;
  }
  const paymentStatus = paymentStatusFor(order.totalMinor, paid, refunded);
  const id = newId('orderPayment');
  const label = `${money(input.amountMinor, order.currency)} by ${PAYMENT_METHOD_LABEL[input.method].toLowerCase()}`;
  await transaction(async (tx) => {
    const claim = await tx.order.updateMany({ where: { id: orderId, paidMinor: order.paidMinor, refundedMinor: order.refundedMinor }, data: { paidMinor: paid, refundedMinor: refunded, paymentStatus } });
    if (claim.count === 0) throw errors.conflict('Another payment was recorded meanwhile. Refresh and try again.');
    await tx.orderPayment.create({
      data: { id, orderId, returnRequestId: forReturn?.id ?? null, kind: input.kind, method: input.method, amountMinor: input.amountMinor, currency: order.currency, reference: input.reference || null, receivedOn, recordedByUserId: me.userId, note: input.note || null },
    });
    if (forReturn) {
      const done = await tx.returnRequest.updateMany({ where: { id: forReturn.id, status: 'RECEIVED' }, data: { status: 'REFUNDED', refundedAt: now, openKey: null } });
      if (done.count === 0) throw errors.conflict('This return changed meanwhile. Refresh and try again.');
    }
    await tx.orderEvent.create({ data: { id: newId('orderEvent'), orderId, action: input.kind === 'RECEIPT' ? 'PAYMENT_RECORDED' : 'REFUND_RECORDED', actorUserId: me.userId, note: label } });
  });
  await recordAuditEvent({ action: input.kind === 'RECEIPT' ? 'ORDER_PAYMENT_RECORDED' : 'ORDER_REFUND_RECORDED', actor: me.userId, subject: orderId, outcome: 'success', organizationId: order.sellerOrganizationId, requestId: context.requestId, detail: { method: input.method } });
  await tellBuyer(order, input.kind === 'RECEIPT' ? `: the seller recorded receiving ${label}` : `: the seller recorded refunding ${label}`);
  return { paymentId: id, paymentStatus };
}

/**
 * Pay online. Goes to the payment port, which answers NOT_CONFIGURED until a
 * provider is connected. Nothing here marks the order paid: only a provider's
 * verified confirmation may, once one exists.
 */
export async function payOnline(principal: Principal, orderId: string) {
  const { order, isBuyer } = await loadOrder(principal, orderId);
  if (!isBuyer) throw errors.notFound('Order');
  if (order.status !== 'CONFIRMED' && order.status !== 'DISPATCHED' && order.status !== 'DELIVERED') throw errors.preconditionFailed('You can pay once the seller confirms the order.');
  const due = order.totalMinor - order.paidMinor;
  if (due <= ZERO) throw errors.preconditionFailed('Nothing is due on this order.');
  const intent = await paymentProvider.get().createIntent({
    amount: { amountMinor: due, currency: order.currency },
    reference: order.id,
    description: `Toothlogy order ${order.number}`,
    idempotencyKey: `order-pay:${order.id}:${due.toString()}`,
  });
  return { status: intent.status, actionUrl: intent.actionUrl ?? null };
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

export const returnRequestSchema = z.object({
  reason: z.enum(['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'EXPIRED', 'OTHER']),
  details: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({ orderLineId: z.string().max(64), quantity: z.number().int().min(1, 'Return at least one.') })).min(1, 'Choose what to return.').max(50),
});

export async function requestReturn(principal: Principal, orderId: string, raw: z.input<typeof returnRequestSchema>, context: { requestId?: string; now?: Date } = {}) {
  const { me, order, isBuyer } = await loadOrder(principal, orderId);
  if (!isBuyer) throw errors.notFound('Order');
  const input = parse(returnRequestSchema, raw);
  const now = context.now ?? new Date();
  if (order.status !== 'DELIVERED' || !order.deliveredAt) throw errors.preconditionFailed('You can ask to return items once the order is delivered.');
  const window = (await db().businessProfile.findUnique({ where: { organizationId: order.sellerOrganizationId }, select: { returnWindowDays: true } }))?.returnWindowDays ?? 0;
  if (window === 0) throw errors.preconditionFailed(`${order.seller.name} does not take returns through Toothlogy. Contact the seller.`);
  if (now.getTime() > order.deliveredAt.getTime() + window * DAY) throw errors.preconditionFailed(`Returns were open for ${window} days after delivery.`);
  if (input.reason === 'OTHER' && !input.details) throw errors.validation('Tell the seller what is wrong.', { field: 'details' });
  const lines = new Map((await db().orderLine.findMany({ where: { orderId } })).map((l) => [l.id, l]));
  const seen = new Set<string>();
  let refundMinor = ZERO;
  for (const want of input.lines) {
    const line = lines.get(want.orderLineId);
    if (!line || seen.has(want.orderLineId)) throw errors.validation('Choose items from this order, once each.', { field: 'lines' });
    seen.add(want.orderLineId);
    const left = line.quantity - line.returnedQuantity;
    if (want.quantity > left) throw errors.validation(`You can return at most ${left} of ${line.name}.`, { field: 'lines' });
    refundMinor += line.unitPriceMinor * BigInt(want.quantity);
  }
  const id = newId('returnRequest');
  try {
    await transaction(async (tx) => {
      await tx.returnRequest.create({ data: { id, orderId, requestedByUserId: me.userId, reason: input.reason, details: input.details || null, lines: input.lines, refundMinor, openKey: orderId } });
      await tx.orderEvent.create({ data: { id: newId('orderEvent'), orderId, action: 'RETURN_REQUESTED', actorUserId: me.userId, note: RETURN_REASON_LABEL[input.reason] } });
    });
  } catch (error) {
    if (isUnique(error)) throw errors.conflict('This order already has a return in progress.');
    throw error;
  }
  await recordAuditEvent({ action: 'RETURN_REQUESTED', actor: me.userId, subject: id, outcome: 'success', organizationId: order.sellerOrganizationId, requestId: context.requestId });
  await tellSeller(order, `Return requested on order ${order.number}: ${money(refundMinor, order.currency)} (${RETURN_REASON_LABEL[input.reason].toLowerCase()}).`);
  return { returnRequestId: id, refundMinor };
}

export const returnActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE'), note }),
  z.object({ action: z.literal('REJECT'), note: z.string().trim().min(3, 'Tell the buyer why.').max(1000) }),
  z.object({ action: z.literal('RECEIVED'), note }),
  z.object({ action: z.literal('CANCEL') }),
]);

export async function actOnReturn(principal: Principal, returnRequestId: string, raw: z.input<typeof returnActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const request = await db().returnRequest.findUnique({ where: { id: returnRequestId } });
  if (!request) throw errors.notFound('Return request');
  const access = await loadOrder(principal, request.orderId).catch(() => {
    throw errors.notFound('Return request');
  });
  const { me, order, isBuyer, sellerReads, sellerManages } = access;
  const input = parse(returnActionSchema, raw);
  const now = context.now ?? new Date();
  const buyerAction = input.action === 'CANCEL';
  if (buyerAction ? !isBuyer : !sellerManages) throw !buyerAction && sellerReads ? errors.forbidden(ORDER_MANAGE) : errors.notFound('Return request');

  const FROM: Record<typeof input.action, ReturnStatus[]> = { APPROVE: ['REQUESTED'], REJECT: ['REQUESTED'], RECEIVED: ['APPROVED'], CANCEL: ['REQUESTED', 'APPROVED'] };
  const TO: Record<typeof input.action, ReturnStatus> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', RECEIVED: 'RECEIVED', CANCEL: 'CANCELLED' };
  if (!FROM[input.action].includes(request.status)) throw errors.preconditionFailed(`A return that is “${RETURN_STATUS_LABEL[request.status].toLowerCase()}” cannot be changed that way.`);
  const to = TO[input.action];
  const data: Prisma.ReturnRequestUpdateManyMutationInput = {
    status: to,
    ...(input.action === 'APPROVE' || input.action === 'REJECT' ? { decidedAt: now } : {}),
    ...(input.action === 'RECEIVED' ? { receivedAt: now } : {}),
    ...(to === 'REJECTED' || to === 'CANCELLED' ? { openKey: null } : {}),
    ...('note' in input && input.note ? { sellerNote: input.note } : {}),
  };
  const wanted = request.lines as Array<{ orderLineId: string; quantity: number }>;

  const creditNote = await transaction(async (tx) => {
    const claim = await tx.returnRequest.updateMany({ where: { id: returnRequestId, status: request.status }, data });
    if (claim.count === 0) throw errors.conflict('This return changed while you were acting on it. Refresh and try again.');
    await tx.orderEvent.create({ data: { id: newId('orderEvent'), orderId: order.id, action: `RETURN_${input.action}`, actorUserId: me.userId, note: 'note' in input ? (input.note ?? null) : null } });
    if (input.action !== 'RECEIVED') return null;
    if ((await tx.taxDocument.count({ where: { invoiceKey: order.id } })) === 0) throw errors.preconditionFailed('Issue the order’s invoice before taking a return, so a credit note can refer to it.');
    const lines = new Map((await tx.orderLine.findMany({ where: { orderId: order.id } })).map((l) => [l.id, l]));
    const documentLines: DocumentLine[] = [];
    for (const want of wanted) {
      const line = lines.get(want.orderLineId)!;
      const moved = await tx.orderLine.updateMany({ where: { id: line.id, returnedQuantity: { lte: line.quantity - want.quantity } }, data: { returnedQuantity: { increment: want.quantity } } });
      if (moved.count === 0) throw errors.conflict(`More of ${line.name} would be returned than was ordered.`);
      documentLines.push({ name: line.name, variantLabel: line.variantLabel, taxCode: line.taxCode, unit: line.unit, quantity: want.quantity, unitPriceMinor: line.unitPriceMinor, rateBasisPoints: line.taxRateBasisPoints, ...lineAmounts(line.unitPriceMinor, want.quantity, line.taxRateBasisPoints) });
    }
    return issueTaxDocument(tx, 'CREDIT_NOTE', order, documentLines, returnRequestId, now);
  });
  await recordAuditEvent({ action: `RETURN_${input.action}`, actor: me.userId, subject: returnRequestId, outcome: 'success', organizationId: order.sellerOrganizationId, requestId: context.requestId, detail: { creditNote: creditNote?.number ?? null } });
  const CHANGE = {
    APPROVE: ': your return was approved. Send the items back as the seller asks',
    REJECT: `: your return was declined${'note' in input && input.note ? ` (${input.note})` : ''}`,
    RECEIVED: `: the seller received the returned items and issued credit note ${creditNote?.number ?? ''}. The refund follows`,
    CANCEL: '',
  } as const;
  if (buyerAction) await tellSeller(order, `The buyer cancelled the return on order ${order.number}.`);
  else await tellBuyer(order, CHANGE[input.action]);
  return { status: to, creditNoteNumber: creditNote?.number ?? null };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getOrder(principal: Principal, orderId: string) {
  const { order, isBuyer, sellerManages } = await loadOrder(principal, orderId);
  const [full, profile] = await Promise.all([
    db().order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        taxDocuments: { select: { id: true, kind: true, number: true, issuedAt: true, totalMinor: true }, orderBy: { issuedAt: 'asc' } },
        returns: { orderBy: { createdAt: 'desc' } },
        seller: { select: { id: true, name: true, slug: true, phone: true, email: true } },
        buyer: { select: { displayName: true, email: true, phone: true } },
        buyerOrganization: { select: { name: true } },
        deliveryDistrict: { select: { name: true, region: { select: { name: true } } } },
      },
    }),
    db().businessProfile.findUnique({ where: { organizationId: order.sellerOrganizationId }, select: { returnWindowDays: true, paymentInstructions: true } }),
  ]);
  const confirmed = order.status === 'CONFIRMED' || order.status === 'DISPATCHED' || order.status === 'DELIVERED';
  return {
    order: full,
    side: isBuyer ? ('BUYER' as const) : ('SELLER' as const),
    canManage: sellerManages,
    paymentInstructions: confirmed ? (profile?.paymentInstructions ?? null) : null,
    returnWindowDays: profile?.returnWindowDays ?? 0,
    onlinePaymentAvailable: paymentProvider.isConfigured(),
  };
}

export async function myOrders(principal: Principal) {
  const me = signedIn(principal);
  return db().order.findMany({
    where: { buyerUserId: me.userId },
    include: { seller: { select: { name: true, slug: true } }, _count: { select: { lines: true } } },
    orderBy: { placedAt: 'desc' },
    take: 200,
  });
}

export async function sellerOrders(principal: Principal, organizationId: string, filter: { status?: OrderStatus } = {}) {
  if (!isAuthenticated(principal) || !can(principal, ORDER_READ, { organizationId })) throw errors.notFound('Organization');
  const [orders, counts] = await Promise.all([
    db().order.findMany({
      where: { sellerOrganizationId: organizationId, ...(filter.status ? { status: filter.status } : {}) },
      include: { buyer: { select: { displayName: true } }, buyerOrganization: { select: { name: true } }, deliveryDistrict: { select: { name: true } }, _count: { select: { lines: true, returns: true } } },
      orderBy: { placedAt: 'desc' },
      take: 300,
    }),
    db().order.groupBy({ by: ['status'], where: { sellerOrganizationId: organizationId }, _count: true }),
  ]);
  return { orders, byStatus: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Partial<Record<OrderStatus, number>> };
}

export async function getTaxDocument(principal: Principal, taxDocumentId: string) {
  const document = await db().taxDocument.findUnique({ where: { id: taxDocumentId }, include: { order: { select: { number: true, placedAt: true } } } });
  if (!document) throw errors.notFound('Tax document');
  await loadOrder(principal, document.orderId).catch(() => {
    throw errors.notFound('Tax document');
  });
  const pack = taxPackFor(document.taxRegime);
  const invoice = document.kind === 'CREDIT_NOTE' ? await db().taxDocument.findUnique({ where: { invoiceKey: document.orderId }, select: { number: true } }) : null;
  return { document, title: pack.documentTitle(document.kind), taxIdentifierLabel: pack.taxIdentifierLabel, taxCodeLabel: pack.taxCodeLabel, againstInvoice: invoice?.number ?? null };
}
