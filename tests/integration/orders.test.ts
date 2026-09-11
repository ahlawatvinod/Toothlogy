/**
 * TL-TEST-ORDERS-001 — cart, orders, payments recorded by the seller, tax
 * documents and returns.
 *
 * Only orderable, priced, published items (by variant where there are
 * variants), minimum order, never from one's own business; one order per
 * seller from the cart at frozen prices, to a district the seller serves,
 * verified email, tax identifier checked; a retried checkout places nothing.
 * The right side for each step; online payment answers NOT_CONFIGURED and
 * marks nothing paid; receipts and refunds bounded by what is due and was
 * received; invoices on dispatch, gapless, CGST + SGST within a state and
 * IGST between states, and no number used when issuing fails; returns in the
 * seller's window with a credit note and an exact refund; tenant isolation.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { matchDistrict } from '@/platform/india-data/districts';
import { createProduct, updateProduct, upsertBusinessProfile } from '@/platform/marketplace/service';
import {
  actOnOrder,
  actOnReturn,
  createVariant,
  getOrder,
  getTaxDocument,
  myCart,
  myOrders,
  payOnline,
  placeOrder,
  recordOrderPayment,
  removeCartItem,
  requestReturn,
  sellerOrders,
  setCartItem,
  updateVariant,
} from '@/platform/marketplace/orders';
import { lineAmounts, taxPackFor } from '@/platform/tax/packs';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;
const B = (n: number) => BigInt(n);

function principal(userId: string, roles: string[], organizations: AuthenticatedPrincipal['organizations'] = []): AuthenticatedPrincipal {
  return { kind: 'user', userId, roles, organizations, sessionId: 'test-session' };
}

let seq = 0;
async function user(label: string, verified = true) {
  seq += 1;
  const { userId } = await register({ email: `${label}-${seq}@example.test`, password: PASSWORD, displayName: `${label} ${seq}`, role: 'patient', acceptedTerms: true });
  if (verified) await testDb().user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return userId;
}

async function business(slug: string, type: 'SUPPLIER' | 'CLINIC' = 'SUPPLIER') {
  const ownerId = await user(`owner-${slug}`);
  const { organizationId } = await createOrganization({ name: `${type} ${slug}`, slug, type, countryCode: 'IN', timezone: 'Asia/Kolkata' }, ownerId);
  const staffId = await user(`staff-${slug}`);
  await testDb().organizationMember.create({ data: { id: `om_${Math.random().toString(36).slice(2)}`, userId: staffId, organizationId, roleKey: 'clinic_staff' } });
  return {
    organizationId,
    ownerId,
    staffId,
    admin: principal(ownerId, ['patient'], [{ organizationId, roles: ['clinic_admin'] }]),
    staff: principal(staffId, ['patient'], [{ organizationId, roles: ['clinic_staff'] }]),
  };
}

/** A supplier registered in `region`, delivering across India, taking returns for 7 days. */
async function seller(slug: string, region: string | null = 'Chhattisgarh') {
  const b = await business(slug);
  if (region) {
    const addressId = `adr_${Math.random().toString(36).slice(2)}`;
    await testDb().address.create({ data: { id: addressId, lines: ['12 Station Road'], locality: 'Pandri', regionName: region, countryCode: 'IN' } });
    await testDb().organization.update({ where: { id: b.organizationId }, data: { addressId } });
  }
  await upsertBusinessProfile(b.admin, b.organizationId, { servesAllIndia: true, gstin: '22AAAAA0000A1Z5', paymentInstructions: 'UPI: dentsupply@upi', returnWindowDays: 7 });
  return b;
}

async function gloves(b: Awaited<ReturnType<typeof business>>, overrides: Record<string, unknown> = {}) {
  const { productId } = await createProduct(b.admin, b.organizationId, { kind: 'GOOD', category: 'consumables', name: 'Nitrile gloves', unit: 'box of 100', priceMinor: '45000', gstRatePercent: 18, minOrderQuantity: 2, orderable: true, taxCode: '4015', ...overrides });
  await updateProduct(b.admin, productId, { status: 'PUBLISHED' });
  return productId;
}

describeIntegration('Marketplace orders', () => {
  let raipur: string;
  let outsider: AuthenticatedPrincipal;
  const delivery = (sellerOrganizationId: string, extra: Record<string, unknown> = {}) => ({
    sellerOrganizationId,
    deliveryName: 'Dr Asha Verma',
    deliveryPhone: '+91 98270 12345',
    deliveryAddress: '14 Civil Lines, near the clock tower',
    deliveryDistrictId: raipur,
    ...extra,
  });

  beforeAll(async () => {
    await assertSeeded();
    raipur = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!.id;
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('sells only orderable, priced, published items — by variant where there are variants', async () => {
    const s = await seller('cartsupply');
    const buyer = principal(await user('buyer'), ['patient']);
    await expect(createProduct(s.admin, s.organizationId, { kind: 'GOOD', category: 'consumables', name: 'Bibs', priceMinor: '9900', orderable: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(createProduct(s.admin, s.organizationId, { kind: 'GOOD', category: 'consumables', name: 'Bibs', gstRatePercent: 12, orderable: true })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const glovesId = await gloves(s);
    const quoteOnly = await gloves(s, { name: 'Dental chair', category: 'equipment', orderable: false, priceMinor: null });
    const kit = await gloves(s, { name: 'Composite kit', priceMinor: null, orderable: false, minOrderQuantity: 1 });

    await expect(createVariant(s.staff, kit, { label: 'A2', priceMinor: '120000' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const { variantId: a2 } = await createVariant(s.admin, kit, { label: 'A2', sku: 'CK-A2', priceMinor: '120000' });
    const { variantId: a3 } = await createVariant(s.admin, kit, { label: 'A3', priceMinor: '125000' });
    await expect(createVariant(s.admin, kit, { label: 'A2', priceMinor: '1' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await updateProduct(s.admin, kit, { orderable: true }); // variants carry the prices
    await updateVariant(s.admin, a3, { available: false });

    await expect(setCartItem(buyer, { productId: quoteOnly, quantity: 1 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(setCartItem(buyer, { productId: glovesId, quantity: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setCartItem(buyer, { productId: kit, quantity: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setCartItem(buyer, { productId: kit, variantId: a3, quantity: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setCartItem(buyer, { productId: glovesId, variantId: a2, quantity: 5 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(setCartItem(s.staff, { productId: glovesId, quantity: 5 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await setCartItem(buyer, { productId: glovesId, quantity: 5 });
    await setCartItem(buyer, { productId: glovesId, quantity: 10 });
    const { cartItemId } = await setCartItem(buyer, { productId: kit, variantId: a2, quantity: 2 });
    let cart = await myCart(buyer);
    expect(cart.lineCount).toBe(2);
    expect(cart.sellers[0]).toMatchObject({ totalMinor: B(450_000 + 240_000), problems: 0 });
    expect(cart.sellers[0]!.lines.find((l) => l.variantId === a2)).toMatchObject({ variantLabel: 'A2', unitPriceMinor: B(120_000) });

    // The seller takes the variant off sale: the line says why it cannot be ordered.
    await updateVariant(s.admin, a2, { status: 'ARCHIVED' });
    cart = await myCart(buyer);
    expect(cart.sellers[0]!.problems).toBe(1);
    await expect(placeOrder(buyer, delivery(s.organizationId))).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(removeCartItem(outsider, cartItemId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await removeCartItem(buyer, cartItemId);
    expect((await myCart(buyer)).lineCount).toBe(1);
  });

  it('places one order per seller from the cart at frozen prices, and a retry places nothing', async () => {
    const s = await seller('checkout');
    const other = await seller('othersupply');
    const clinic = await business('buyerclinic', 'CLINIC');
    const glovesId = await gloves(s);
    const otherItem = await gloves(other);
    const fresh = principal(await user('fresh', false), ['patient']);
    await setCartItem(fresh, { productId: glovesId, quantity: 2 });
    await expect(placeOrder(fresh, delivery(s.organizationId))).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await setCartItem(clinic.admin, { productId: glovesId, quantity: 10 });
    await setCartItem(clinic.admin, { productId: otherItem, quantity: 3 });
    await upsertBusinessProfile(s.admin, s.organizationId, { servesAllIndia: false, serviceDistrictIds: [(await matchDistrict('IN', 'Chhattisgarh', 'Durg'))!.id] });
    await expect(placeOrder(clinic.admin, delivery(s.organizationId))).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: { field: 'deliveryDistrictId' } });
    await upsertBusinessProfile(s.admin, s.organizationId, { servesAllIndia: true });
    await expect(placeOrder(clinic.admin, delivery(s.organizationId, { buyerTaxIdentifier: '22ABC' }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(placeOrder(clinic.admin, delivery(s.organizationId, { buyerOrganizationId: s.organizationId }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const placed = await placeOrder(clinic.admin, delivery(s.organizationId, { buyerOrganizationId: clinic.organizationId, buyerTaxIdentifier: '22bbbbb1111b1z5' }));
    const expected = lineAmounts(B(45_000), 10, 1800);
    expect(placed.totalMinor).toBe(expected.grossMinor);
    const order = await testDb().order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { lines: true } });
    expect(order).toMatchObject({ status: 'PLACED', paymentStatus: 'UNPAID', subtotalMinor: expected.netMinor, taxMinor: expected.taxMinor, totalMinor: expected.grossMinor, buyerTaxIdentifier: '22BBBBB1111B1Z5', currency: 'INR' });
    expect(order.lines).toMatchObject([{ name: 'Nitrile gloves', quantity: 10, unitPriceMinor: B(45_000), taxRateBasisPoints: 1800, taxCode: '4015' }]);
    expect(order.number).toMatch(/^TLO-[0-9A-Z]{10}$/);

    // Only that seller's lines left the cart; a retried checkout places nothing.
    expect((await myCart(clinic.admin)).sellers.map((g) => g.seller.id)).toEqual([other.organizationId]);
    await expect(placeOrder(clinic.admin, delivery(s.organizationId))).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await testDb().order.count()).toBe(1);

    // Prices are frozen on the order.
    await updateProduct(s.admin, glovesId, { priceMinor: '99000' });
    expect((await testDb().orderLine.findFirstOrThrow({ where: { orderId: placed.orderId } })).unitPriceMinor).toBe(B(45_000));

    expect(await testDb().inAppNotification.count({ where: { userId: s.ownerId, notificationId: 'TL-NOTIF-ORDER-RECEIVED-001' } })).toBe(1);
    expect(await testDb().inAppNotification.count({ where: { userId: clinic.ownerId, notificationId: 'TL-NOTIF-ORDER-CONFIRMATION-001' } })).toBe(1);
    expect(await myOrders(clinic.admin)).toHaveLength(1);
    expect((await sellerOrders(s.staff, s.organizationId)).orders).toHaveLength(1);
    await expect(sellerOrders(other.admin, s.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getOrder(other.admin, placed.orderId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getOrder(outsider, placed.orderId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('runs fulfilment with payments recorded by the seller, a gapless invoice on dispatch, and delivery', async () => {
    const s = await seller('fulfil');
    const glovesId = await gloves(s);
    const buyerId = await user('buyer');
    const buyer = principal(buyerId, ['patient']);
    const place = async (quantity: number) => {
      await setCartItem(buyer, { productId: glovesId, quantity });
      return (await placeOrder(buyer, delivery(s.organizationId))).orderId;
    };
    const orderId = await place(10);
    const total = lineAmounts(B(45_000), 10, 1800).grossMinor;
    const today = new Date().toISOString().slice(0, 10);

    await expect(actOnOrder(s.staff, orderId, { action: 'CONFIRM' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnOrder(buyer, orderId, { action: 'CONFIRM' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnOrder(outsider, orderId, { action: 'CANCEL' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'UPI', amountMinor: '1000', receivedOn: today })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await getOrder(buyer, orderId)).paymentInstructions).toBeNull();
    await actOnOrder(s.admin, orderId, { action: 'CONFIRM' });
    expect((await getOrder(buyer, orderId)).paymentInstructions).toBe('UPI: dentsupply@upi');
    await expect(actOnOrder(buyer, orderId, { action: 'CANCEL' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    // Online payment is a port with no provider: it refuses, and nothing is marked paid.
    await expect(payOnline(buyer, orderId)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    await expect(payOnline(s.admin, orderId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('UNPAID');

    await expect(recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'UPI', amountMinor: (total + B(1)).toString(), receivedOn: today })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordOrderPayment(s.admin, orderId, { kind: 'REFUND', method: 'UPI', amountMinor: '100', receivedOn: today })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'UPI', amountMinor: '100', receivedOn: '2099-01-01' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'UPI', amountMinor: '200000', receivedOn: today, reference: 'UPI-771' })).toMatchObject({ paymentStatus: 'PARTLY_PAID' });
    expect(await recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'BANK_TRANSFER', amountMinor: (total - B(200_000)).toString(), receivedOn: today })).toMatchObject({ paymentStatus: 'PAID' });
    await expect(testDb().$executeRawUnsafe(`UPDATE "orders" SET "paidMinor" = "totalMinor" + 1 WHERE "id" = '${orderId}'`)).rejects.toThrow();

    // Dispatch issues the invoice: CGST + SGST within Chhattisgarh.
    const dispatched = await actOnOrder(s.admin, orderId, { action: 'DISPATCH', carrier: 'DTDC', trackingReference: 'D123' });
    const fy = taxPackFor('GST').fiscalYear(new Date()).replace(/\D/g, '');
    expect(dispatched).toMatchObject({ status: 'DISPATCHED', invoiceNumber: `INV${fy}-00001` });
    const invoice = await testDb().taxDocument.findFirstOrThrow({ where: { orderId } });
    const order = await testDb().order.findUniqueOrThrow({ where: { id: orderId } });
    expect(invoice).toMatchObject({ kind: 'INVOICE', sellerRegion: 'Chhattisgarh', placeOfSupply: 'Chhattisgarh', supplyKind: 'INTRA_STATE', sellerTaxIdentifier: '22AAAAA0000A1Z5', totalMinor: order.totalMinor, taxMinor: order.taxMinor });
    const breakdown = invoice.taxBreakdown as Array<{ label: string; amountMinor: string }>;
    expect(breakdown.map((c) => c.label)).toEqual(['CGST', 'SGST']);
    expect(breakdown.reduce((n, c) => n + BigInt(c.amountMinor), B(0))).toBe(order.taxMinor);
    await expect(actOnOrder(s.admin, orderId, { action: 'ISSUE_INVOICE' })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await getTaxDocument(buyer, invoice.id)).title).toBe('Tax invoice');
    await expect(getTaxDocument(outsider, invoice.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await actOnOrder(buyer, orderId, { action: 'DELIVERED' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('DELIVERED');
    expect(await testDb().inAppNotification.count({ where: { userId: buyerId, notificationId: 'TL-NOTIF-ORDER-UPDATE-001' } })).toBe(4); // confirmed, two payments, dispatched

    // The next invoice takes the next number.
    const second = await place(2);
    await actOnOrder(s.admin, second, { action: 'CONFIRM' });
    expect((await actOnOrder(s.admin, second, { action: 'ISSUE_INVOICE' })).invoiceNumber).toBe(`INV${fy}-00002`);

    // A seller with no address cannot issue: the dispatch rolls back and no number is used.
    const bare = await seller('bare', null);
    const bareItem = await gloves(bare);
    await setCartItem(buyer, { productId: bareItem, quantity: 2 });
    const bareOrder = (await placeOrder(buyer, delivery(bare.organizationId))).orderId;
    await actOnOrder(bare.admin, bareOrder, { action: 'CONFIRM' });
    await expect(actOnOrder(bare.admin, bareOrder, { action: 'DISPATCH' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: bareOrder } })).status).toBe('CONFIRMED');
    expect(await testDb().taxDocumentSeries.count({ where: { sellerOrganizationId: bare.organizationId } })).toBe(0);

    // A seller in another state charges IGST.
    const mh = await seller('mumbaisupply', 'Maharashtra');
    const mhItem = await gloves(mh);
    await setCartItem(buyer, { productId: mhItem, quantity: 2 });
    const mhOrder = (await placeOrder(buyer, delivery(mh.organizationId))).orderId;
    await actOnOrder(mh.admin, mhOrder, { action: 'CONFIRM' });
    await actOnOrder(mh.admin, mhOrder, { action: 'DISPATCH' });
    const igst = await testDb().taxDocument.findFirstOrThrow({ where: { orderId: mhOrder } });
    expect(igst).toMatchObject({ supplyKind: 'INTER_STATE', number: `INV${fy}-00001` });
    expect((igst.taxBreakdown as Array<{ label: string }>).map((c) => c.label)).toEqual(['IGST']);
  });

  it('declines and cancels only with reasons and only from the right states', async () => {
    const s = await seller('cancels');
    const glovesId = await gloves(s);
    const buyer = principal(await user('buyer'), ['patient']);
    const place = async () => {
      await setCartItem(buyer, { productId: glovesId, quantity: 2 });
      return (await placeOrder(buyer, delivery(s.organizationId))).orderId;
    };
    const first = await place();
    await actOnOrder(buyer, first, { action: 'CANCEL' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: first } })).status).toBe('CANCELLED');
    await expect(actOnOrder(s.admin, first, { action: 'CONFIRM' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    const second = await place();
    await expect(actOnOrder(s.admin, second, { action: 'DECLINE' } as never)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnOrder(s.admin, second, { action: 'DECLINE', note: 'Out of stock this week' });
    expect(await testDb().order.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: 'DECLINED', sellerNote: 'Out of stock this week' });

    const third = await place();
    await actOnOrder(s.admin, third, { action: 'CONFIRM' });
    await expect(actOnOrder(s.admin, third, { action: 'CANCEL' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await actOnOrder(s.admin, third, { action: 'CANCEL', note: 'Buyer asked by phone' });
    expect((await testDb().order.findUniqueOrThrow({ where: { id: third } })).cancelReason).toBe('Buyer asked by phone');
    expect((await sellerOrders(s.admin, s.organizationId)).byStatus).toMatchObject({ CANCELLED: 2, DECLINED: 1 });
  });

  it('takes returns in the seller’s window, with a credit note and an exact refund', async () => {
    const s = await seller('returns');
    const glovesId = await gloves(s);
    const buyer = principal(await user('buyer'), ['patient']);
    const today = new Date().toISOString().slice(0, 10);
    const delivered = async (quantity: number) => {
      await setCartItem(buyer, { productId: glovesId, quantity });
      const { orderId, totalMinor } = await placeOrder(buyer, delivery(s.organizationId));
      await actOnOrder(s.admin, orderId, { action: 'CONFIRM' });
      await recordOrderPayment(s.admin, orderId, { kind: 'RECEIPT', method: 'UPI', amountMinor: totalMinor.toString(), receivedOn: today });
      await actOnOrder(s.admin, orderId, { action: 'DISPATCH' });
      await actOnOrder(s.admin, orderId, { action: 'DELIVERED' });
      return orderId;
    };
    const orderId = await delivered(10);
    const line = await testDb().orderLine.findFirstOrThrow({ where: { orderId } });

    await upsertBusinessProfile(s.admin, s.organizationId, { returnWindowDays: 0 });
    await expect(requestReturn(buyer, orderId, { reason: 'DAMAGED', lines: [{ orderLineId: line.id, quantity: 1 }] })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await upsertBusinessProfile(s.admin, s.organizationId, { returnWindowDays: 7 });
    await expect(requestReturn(s.admin, orderId, { reason: 'DAMAGED', lines: [{ orderLineId: line.id, quantity: 1 }] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(requestReturn(buyer, orderId, { reason: 'DAMAGED', lines: [{ orderLineId: line.id, quantity: 11 }] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(requestReturn(buyer, orderId, { reason: 'OTHER', lines: [{ orderLineId: line.id, quantity: 1 }] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const { returnRequestId, refundMinor } = await requestReturn(buyer, orderId, { reason: 'DAMAGED', details: 'Two boxes torn', lines: [{ orderLineId: line.id, quantity: 2 }] });
    expect(refundMinor).toBe(B(90_000));
    await expect(requestReturn(buyer, orderId, { reason: 'DAMAGED', lines: [{ orderLineId: line.id, quantity: 1 }] })).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(actOnReturn(s.staff, returnRequestId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnReturn(buyer, returnRequestId, { action: 'APPROVE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnReturn(s.admin, returnRequestId, { action: 'RECEIVED' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await actOnReturn(s.admin, returnRequestId, { action: 'APPROVE' });
    const received = await actOnReturn(s.admin, returnRequestId, { action: 'RECEIVED' });
    const fy = taxPackFor('GST').fiscalYear(new Date()).replace(/\D/g, '');
    expect(received.creditNoteNumber).toBe(`CN${fy}-00001`);
    const note = await testDb().taxDocument.findFirstOrThrow({ where: { returnRequestId } });
    expect(note).toMatchObject({ kind: 'CREDIT_NOTE', totalMinor: B(90_000), invoiceKey: null });
    expect((await getTaxDocument(buyer, note.id)).againstInvoice).toMatch(/^INV/);
    expect((await testDb().orderLine.findUniqueOrThrow({ where: { id: line.id } })).returnedQuantity).toBe(2);

    await expect(recordOrderPayment(s.admin, orderId, { kind: 'REFUND', method: 'UPI', amountMinor: '80000', receivedOn: today, returnRequestId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await recordOrderPayment(s.admin, orderId, { kind: 'REFUND', method: 'UPI', amountMinor: '90000', receivedOn: today, returnRequestId })).toMatchObject({ paymentStatus: 'PARTLY_REFUNDED' });
    expect(await testDb().returnRequest.findUniqueOrThrow({ where: { id: returnRequestId } })).toMatchObject({ status: 'REFUNDED', openKey: null });

    // A second return may follow; past the window it may not.
    const again = await requestReturn(buyer, orderId, { reason: 'WRONG_ITEM', lines: [{ orderLineId: line.id, quantity: 8 }] });
    await actOnReturn(buyer, again.returnRequestId, { action: 'CANCEL' });
    const late = await delivered(2);
    await testDb().order.update({ where: { id: late }, data: { deliveredAt: new Date(Date.now() - 8 * DAY) } });
    const lateLine = await testDb().orderLine.findFirstOrThrow({ where: { orderId: late } });
    await expect(requestReturn(buyer, late, { reason: 'DAMAGED', lines: [{ orderLineId: lateLine.id, quantity: 1 }] })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'RETURN_' } } })).toBe(5);
  });
});
