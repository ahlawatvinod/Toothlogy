/**
 * TL-TEST-MARKETPLACE-001 — dental businesses, catalogue and quote requests.
 *
 * Business types only, their administrators only; closed categories, GSTIN
 * format, lab turnaround, service districts; drafts hidden, sellers that
 * nobody manages hidden, district filter; quote requests from verified
 * buyers only, never the seller's own people, minimum order, one open per
 * product; quote validity, accept / withdraw / decline / close by the right
 * side only, expiry; notifications both ways; numbers; tenant isolation.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { register } from '@/platform/auth/service';
import { createOrganization } from '@/platform/organizations/service';
import { matchDistrict } from '@/platform/india-data/districts';
import {
  actOnQuote,
  businessConsole,
  createProduct,
  expireQuotes,
  getPublicBusiness,
  listPublicProducts,
  listSellerQuotes,
  myQuoteRequests,
  requestQuote,
  sellerQuoteStats,
  updateProduct,
  upsertBusinessProfile,
} from '@/platform/marketplace/service';
import type { AuthenticatedPrincipal } from '@/platform/rbac';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb, useDatabaseAuditSink } from '../helpers/database';

const PASSWORD = 'a sufficiently long passphrase';
const DAY = 86_400_000;

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

async function business(slug: string, type: 'SUPPLIER' | 'DISTRIBUTOR' | 'LABORATORY' | 'CLINIC' = 'SUPPLIER') {
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

async function publishedItem(b: Awaited<ReturnType<typeof business>>, overrides: Record<string, unknown> = {}) {
  const { productId } = await createProduct(b.admin, b.organizationId, { kind: 'GOOD', category: 'consumables', name: 'Nitrile gloves', brand: 'SafeTouch', unit: 'box of 100', priceMinor: '45000', minOrderQuantity: 5, ...overrides });
  await updateProduct(b.admin, productId, { status: 'PUBLISHED' });
  return productId;
}

describeIntegration('Marketplace', () => {
  let raipur: string;
  let durg: string;
  let bastar: string;
  let outsider: AuthenticatedPrincipal;

  beforeAll(async () => {
    await assertSeeded();
    raipur = (await matchDistrict('IN', 'Chhattisgarh', 'Raipur'))!.id;
    durg = (await matchDistrict('IN', 'Chhattisgarh', 'Durg'))!.id;
    bastar = (await matchDistrict('IN', 'Chhattisgarh', 'Bastar'))!.id;
  });
  afterAll(async () => {
    await disconnectTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    useDatabaseAuditSink();
    outsider = principal(await user('outsider'), ['patient']);
  });

  it('keeps the catalogue to businesses and their administrators, with closed categories and checked details', async () => {
    const s = await business('dentsupply');
    const lab = await business('smilelab', 'LABORATORY');
    const clinic = await business('smileclinic', 'CLINIC');
    const item = { kind: 'GOOD' as const, category: 'consumables', name: 'Nitrile gloves' };

    await expect(createProduct(clinic.admin, clinic.organizationId, item)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(createProduct(outsider, s.organizationId, item)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createProduct(s.staff, s.organizationId, item)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createProduct(s.admin, s.organizationId, { ...item, category: 'snacks' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(upsertBusinessProfile(s.admin, s.organizationId, { categories: ['snacks'] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(upsertBusinessProfile(s.admin, s.organizationId, { gstin: '22ABC' })).rejects.toThrow();
    await expect(upsertBusinessProfile(s.admin, s.organizationId, { turnaroundDays: 5 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(upsertBusinessProfile(s.admin, s.organizationId, { serviceDistrictIds: ['dst_nope'] })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await upsertBusinessProfile(s.admin, s.organizationId, { categories: ['consumables', 'instruments'], brands: ['SafeTouch'], gstin: '22aaaaa0000a1z5', serviceDistrictIds: [raipur, durg, raipur] });
    let profile = await testDb().businessProfile.findUniqueOrThrow({ where: { organizationId: s.organizationId }, include: { serviceAreas: true } });
    expect(profile.gstin).toBe('22AAAAA0000A1Z5');
    expect(profile.serviceAreas.map((a) => a.districtId).sort()).toEqual([raipur, durg].sort());
    await upsertBusinessProfile(s.admin, s.organizationId, { serviceDistrictIds: [raipur] });
    profile = await testDb().businessProfile.findUniqueOrThrow({ where: { organizationId: s.organizationId }, include: { serviceAreas: true } });
    expect(profile.serviceAreas.map((a) => a.districtId)).toEqual([raipur]);
    expect(profile.brands).toEqual(['SafeTouch']);
    await upsertBusinessProfile(lab.admin, lab.organizationId, { categories: ['lab_crowns_bridges'], turnaroundDays: 5, servesAllIndia: true });

    const first = await createProduct(s.admin, s.organizationId, { ...item, priceMinor: '45000', unit: 'box of 100' });
    await createProduct(s.admin, s.organizationId, item);
    const products = (await businessConsole(s.admin, s.organizationId)).products;
    expect(products.map((p) => p.slug).sort()).toEqual(['nitrile-gloves', 'nitrile-gloves-2']);
    expect(await testDb().product.findUniqueOrThrow({ where: { id: first.productId } })).toMatchObject({ priceMinor: BigInt(45_000), currency: 'INR', status: 'DRAFT' });
    await expect(testDb().$executeRawUnsafe(`UPDATE "products" SET "minOrderQuantity" = 0 WHERE "id" = '${first.productId}'`)).rejects.toThrow();
  });

  it('lists only published items of businesses someone manages, filtered by district served and name', async () => {
    const s = await business('raipursupply');
    const lab = await business('indialab', 'LABORATORY');
    await upsertBusinessProfile(s.admin, s.organizationId, { serviceDistrictIds: [raipur] });
    await upsertBusinessProfile(lab.admin, lab.organizationId, { servesAllIndia: true });
    const gloves = await publishedItem(s);
    await createProduct(s.admin, s.organizationId, { kind: 'GOOD', category: 'instruments', name: 'Mouth mirror' }); // draft
    const crown = await publishedItem(lab, { kind: 'SERVICE', category: 'lab_crowns_bridges', name: 'Zirconia crown', brand: null, unit: 'crown', minOrderQuantity: 1 });

    expect((await listPublicProducts()).map((p) => p.id).sort()).toEqual([gloves, crown].sort());
    expect((await listPublicProducts({ districtId: raipur })).map((p) => p.id).sort()).toEqual([gloves, crown].sort());
    expect((await listPublicProducts({ districtId: bastar })).map((p) => p.id)).toEqual([crown]);
    expect((await listPublicProducts({ category: 'lab_crowns_bridges' })).map((p) => p.id)).toEqual([crown]);
    expect((await listPublicProducts({ q: 'safetouch' })).map((p) => p.id)).toEqual([gloves]);
    expect((await getPublicBusiness('raipursupply'))?.products.map((p) => p.id)).toEqual([gloves]);

    // Nobody manages it any more: not listed, and its page shows nothing to buy.
    await testDb().organization.update({ where: { id: s.organizationId }, data: { ownerUserId: null } });
    expect((await listPublicProducts()).map((p) => p.id)).toEqual([crown]);
    expect((await getPublicBusiness('raipursupply'))?.products).toEqual([]);
    expect(await getPublicBusiness('nope')).toBeNull();
  });

  it('takes quote requests from verified buyers only, never the seller’s own, one open per product', async () => {
    const s = await business('quotes1');
    const clinic = await business('buyerclinic', 'CLINIC');
    const productId = await publishedItem(s);
    const buyerId = await user('buyer');
    const buyer = principal(buyerId, ['patient']);

    await expect(requestQuote(principal(await user('fresh', false), ['patient']), productId, { quantity: 10 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(requestQuote(buyer, productId, { quantity: 2 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(requestQuote(s.staff, productId, { quantity: 10 })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(requestQuote(buyer, productId, { quantity: 10, buyerOrganizationId: clinic.organizationId })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const draft = await createProduct(s.admin, s.organizationId, { kind: 'GOOD', category: 'instruments', name: 'Probe' });
    await expect(requestQuote(buyer, draft.productId, { quantity: 1 })).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const { quoteRequestId } = await requestQuote(clinic.admin, productId, { quantity: 20, message: 'Size M', buyerOrganizationId: clinic.organizationId, deliveryDistrictId: raipur });
    await expect(requestQuote(clinic.admin, productId, { quantity: 30 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await testDb().inAppNotification.count({ where: { userId: s.ownerId, notificationId: 'TL-NOTIF-QUOTE-REQUEST-001' } })).toBe(1);

    const [row] = await listSellerQuotes(s.staff, s.organizationId);
    expect(row).toMatchObject({ id: quoteRequestId, quantity: 20, status: 'NEW' });
    expect(row!.buyerOrganization?.name).toContain('buyerclinic');
    const other = await business('othersupply');
    await expect(listSellerQuotes(other.admin, s.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(listSellerQuotes(outsider, s.organizationId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await myQuoteRequests(clinic.admin)).toHaveLength(1);
    expect(await myQuoteRequests(buyer)).toHaveLength(0);
  });

  it('lets the seller quote with a validity and the buyer accept, withdraw, or find it expired', async () => {
    const s = await business('quotes2');
    const productId = await publishedItem(s);
    const buyerId = await user('buyer2');
    const buyer = principal(buyerId, ['patient']);
    const { quoteRequestId } = await requestQuote(buyer, productId, { quantity: 10 });
    const valid = (days: number) => new Date(Date.now() + days * DAY).toISOString();

    await expect(actOnQuote(buyer, quoteRequestId, { action: 'QUOTE', priceMinor: '400000', validUntil: valid(5) })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnQuote(s.staff, quoteRequestId, { action: 'QUOTE', priceMinor: '400000', validUntil: valid(5) })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(actOnQuote(outsider, quoteRequestId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnQuote(s.admin, quoteRequestId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(actOnQuote(buyer, quoteRequestId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(actOnQuote(s.admin, quoteRequestId, { action: 'QUOTE', priceMinor: '400000', validUntil: valid(-1) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(actOnQuote(s.admin, quoteRequestId, { action: 'QUOTE', priceMinor: '400000', validUntil: valid(120) })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(actOnQuote(s.admin, quoteRequestId, { action: 'DECLINE' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await actOnQuote(s.admin, quoteRequestId, { action: 'QUOTE', priceMinor: '420000', validUntil: valid(5) });
    await actOnQuote(s.admin, quoteRequestId, { action: 'QUOTE', priceMinor: '400000', validUntil: valid(5), note: 'Includes delivery' });
    expect(await testDb().inAppNotification.count({ where: { userId: buyerId, notificationId: 'TL-NOTIF-QUOTE-UPDATE-001' } })).toBe(2);
    await actOnQuote(buyer, quoteRequestId, { action: 'ACCEPT' });
    const accepted = await testDb().quoteRequest.findUniqueOrThrow({ where: { id: quoteRequestId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
    expect(accepted).toMatchObject({ status: 'ACCEPTED', quotedPriceMinor: BigInt(400_000), currency: 'INR', sellerNote: 'Includes delivery', openKey: null });
    expect(accepted.events.map((e) => e.action)).toEqual(['REQUESTED', 'QUOTE', 'QUOTE', 'ACCEPT']);
    expect(await testDb().inAppNotification.count({ where: { userId: s.ownerId, notificationId: 'TL-NOTIF-QUOTE-REQUEST-001' } })).toBe(2);
    await expect(actOnQuote(buyer, quoteRequestId, { action: 'WITHDRAW' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await actOnQuote(s.admin, quoteRequestId, { action: 'CLOSE' });

    // Closed, the buyer may ask again; a quote left past its date cannot be accepted.
    const again = await requestQuote(buyer, productId, { quantity: 15 });
    await actOnQuote(s.admin, again.quoteRequestId, { action: 'QUOTE', priceMinor: '600000', validUntil: valid(1) });
    await testDb().quoteRequest.update({ where: { id: again.quoteRequestId }, data: { validUntil: new Date(Date.now() - 1000) } });
    await expect(actOnQuote(buyer, again.quoteRequestId, { action: 'ACCEPT' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(await expireQuotes()).toBe(1);
    expect(await expireQuotes()).toBe(0);
    expect((await testDb().quoteRequest.findUniqueOrThrow({ where: { id: again.quoteRequestId } })).status).toBe('EXPIRED');

    const third = await requestQuote(buyer, productId, { quantity: 5 });
    await actOnQuote(buyer, third.quoteRequestId, { action: 'WITHDRAW' });
    const stats = await sellerQuoteStats(s.admin, s.organizationId);
    expect(stats).toMatchObject({ total: 3, open: 0, won: 1, winRate: 33.3 });
    // Only what succeeded is audited: 3 requests, 3 quotes, accept, close, withdraw.
    expect(await testDb().auditEvent.count({ where: { action: { startsWith: 'QUOTE_' } } })).toBe(9);
  });
});
