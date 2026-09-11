/**
 * TL-TEST-E2E-ORDERS-001 — an order from cart to refund, in a real browser.
 *
 * Seller: adds a product with a price and tax rate, publishes it and marks it
 * sold at the listed price. Buyer: adds it to the cart from the business's
 * page, checks out on a phone-sized screen, and lands on the order. Seller:
 * confirms, records the buyer's UPI payment, dispatches — which issues a GST
 * tax invoice with CGST and SGST (the seller and the delivery are both in
 * Chhattisgarh). Buyer: sees the payment as the seller's record, confirms
 * receipt and asks to return one box. Seller: approves, receives it (credit
 * note issued) and records the refund. No money moves through Toothlogy.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the business (organization with its registered address,
 * administrator membership, trading profile with payment instructions and a
 * 7-day return window) is created for the seller's account. Passwords are
 * generated per run. Needs the development DATABASE_URL (from .env.local).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

function envLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '');
}

const prisma = new PrismaClient({ datasources: { db: { url: envLocal('DATABASE_URL') } } });
const stamp = Date.now().toString(36);
const id = (prefix: string) => `${prefix}_e2e_${stamp}_${Math.random().toString(36).slice(2, 7)}`;
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-ord-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const seller = person('Seller');
const buyer = person('Buyer');
const businessName = `E2E Order Supplies ${stamp}`;
const productName = `E2E Gloves ${stamp}`;
const state = { organizationId: '', slug: `e2e-order-supplies-${stamp}`, orderId: '' };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof seller): Promise<{ page: Page; userId: string }> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(who.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email: who.email }, data: { emailVerifiedAt: new Date() } });
  return { page, userId: user.id };
}

async function signIn(browser: Browser, who: typeof seller): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

async function fitsPhone(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== 'fixed')
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `overflowing: ${wide.join(', ')}`).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}

const nextSteps = (page: Page) => page.getByRole('region', { name: 'Next steps' });

test('a business lists a product it sells at the listed price', async ({ browser }) => {
  const { page, userId } = await register(browser, seller);
  const addressId = id('adr');
  state.organizationId = id('org');
  await prisma.address.create({ data: { id: addressId, lines: ['12 Station Road'], locality: 'Pandri', regionName: 'Chhattisgarh', countryCode: 'IN' } });
  await prisma.organization.create({ data: { id: state.organizationId, type: 'SUPPLIER', name: businessName, slug: state.slug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: userId, addressId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId, organizationId: state.organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });
  await prisma.businessProfile.create({ data: { organizationId: state.organizationId, categories: ['consumables'], gstin: '22AAAAA0000A1Z5', servesAllIndia: true, paymentInstructions: 'UPI: e2e-supplies@upi', returnWindowDays: 7 } });

  await page.goto(`/account/organizations/${state.organizationId}/business`);
  await expect(page.getByRole('heading', { name: 'Catalogue', exact: true })).toBeVisible({ timeout: 120_000 });
  const add = page.getByRole('region', { name: 'Add a product or service' });
  await add.getByLabel('Name', { exact: true }).fill(productName);
  await add.getByLabel(/^Unit/).fill('box of 100');
  await add.getByLabel(/^Indicative price/).fill('450');
  await add.getByLabel('Tax rate (GST)').selectOption('18');
  await add.getByLabel('Minimum order', { exact: true }).fill('2');
  await add.getByRole('button', { name: 'Add to catalogue' }).click();
  await expect(page.getByText('Added as a draft. Publish it when the details are right.')).toBeVisible({ timeout: 60_000 });

  const item = page.getByRole('list', { name: 'Catalogue' }).getByRole('listitem').filter({ hasText: productName }).first();
  await item.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published: buyers can see it and ask for a quote.')).toBeVisible({ timeout: 60_000 });
  await item.getByRole('button', { name: 'Edit' }).click();
  await item.getByLabel('HSN/SAC code (optional)').fill('4015');
  await item.getByRole('checkbox', { name: /Buyers can order it at the listed price/ }).check();
  await item.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(item.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 60_000 });

  const product = await prisma.product.findFirstOrThrow({ where: { organizationId: state.organizationId } });
  expect(product).toMatchObject({ status: 'PUBLISHED', orderable: true, gstRatePercent: 18, taxCode: '4015', priceMinor: BigInt(45_000), minOrderQuantity: 2 });
});

test('a buyer adds it to the cart and checks out on a phone', async ({ browser }) => {
  const { page } = await register(browser, buyer);
  await page.goto(`/suppliers/${state.slug}`);
  const buy = page.getByRole('region', { name: 'Buy at the listed price' });
  await expect(buy).toBeVisible({ timeout: 120_000 });
  await buy.getByLabel(/^How many/).fill('1');
  await buy.getByRole('button', { name: 'Add to cart' }).click();
  await expect(buy.getByText('Enter a whole number of at least 2.')).toBeVisible();
  await buy.getByLabel(/^How many/).fill('4');
  await buy.getByRole('button', { name: 'Add to cart' }).click();
  await expect(buy.getByText('Added to your cart')).toBeVisible({ timeout: 60_000 });
  await buy.getByRole('link', { name: 'Go to the cart' }).click();

  const group = page.getByRole('region', { name: `Order from ${businessName}` });
  await expect(group).toBeVisible({ timeout: 120_000 });
  await expect(group.getByText('₹1,800.00').first()).toBeVisible();
  await fitsPhone(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await group.getByLabel(/^Deliver to/).fill(buyer.name);
  await group.getByLabel(/^Phone for delivery/).fill('+91 98270 12345');
  await group.getByLabel(/^Delivery address/).fill('14 Civil Lines, near the clock tower');
  await group.getByLabel(/^District/).selectOption({ label: 'Raipur, Chhattisgarh' });
  await group.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL('**/orders/**', { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: /^Order TLO-/ })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Waiting for the seller').first()).toBeVisible();
  await expect(page.getByText(/Wait for .* to confirm the order before paying/)).toBeVisible();
  await fitsPhone(page);

  const order = await prisma.order.findFirstOrThrow({ where: { sellerOrganizationId: state.organizationId }, include: { lines: true } });
  state.orderId = order.id;
  expect(order).toMatchObject({ status: 'PLACED', totalMinor: BigInt(180_000), paymentStatus: 'UNPAID' });
  expect(order.lines).toMatchObject([{ quantity: 4, unitPriceMinor: BigInt(45_000), taxRateBasisPoints: 1800 }]);
  expect(await prisma.cartItem.count({ where: { user: { email: buyer.email } } })).toBe(0);
});

test('the seller confirms, records the payment and dispatches with a GST invoice', async ({ browser }) => {
  const page = await signIn(browser, seller);
  await page.goto(`/account/organizations/${state.organizationId}/orders`);
  const listed = page.getByRole('region', { name: /^Order TLO-/ });
  await expect(listed).toBeVisible({ timeout: 120_000 });
  await listed.getByRole('link').click();
  await expect(page.getByRole('heading', { name: /^Order TLO-/ })).toBeVisible({ timeout: 120_000 });

  await nextSteps(page).getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByText('Confirmed. The buyer can now pay you as your profile says.')).toBeVisible({ timeout: 60_000 });
  await nextSteps(page).getByRole('button', { name: 'Record a payment' }).click();
  await expect(nextSteps(page).getByLabel('Amount (rupees)')).toHaveValue('1800.00');
  await nextSteps(page).getByLabel('Reference (optional)').fill('UPI-E2E-771');
  await nextSteps(page).getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByText('Payment recorded. The buyer has been told.')).toBeVisible({ timeout: 60_000 });
  await nextSteps(page).getByRole('button', { name: 'Dispatch' }).click();
  await nextSteps(page).getByLabel('Carrier (optional)').fill('DTDC');
  await nextSteps(page).getByRole('button', { name: 'Mark dispatched' }).click();
  await expect(page.getByText('Dispatched. The tax invoice is issued and the buyer has been told.')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('region', { name: 'Tax documents' }).getByRole('link', { name: /^Tax invoice INV/ }).click();
  const invoice = page.getByRole('article', { name: 'Tax invoice' });
  await expect(invoice).toBeVisible({ timeout: 120_000 });
  await expect(invoice.getByText('GSTIN: 22AAAAA0000A1Z5')).toBeVisible();
  await expect(invoice.getByText('CGST 9%', { exact: true })).toBeVisible();
  await expect(invoice.getByText('SGST 9%', { exact: true })).toBeVisible();
  await expect(invoice.getByText(/Place of supply: Chhattisgarh \(within the state\)/)).toBeVisible();
  await fitsPhone(page);

  const order = await prisma.order.findUniqueOrThrow({ where: { id: state.orderId }, include: { taxDocuments: true, payments: true } });
  expect(order).toMatchObject({ status: 'DISPATCHED', paymentStatus: 'PAID', paidMinor: BigInt(180_000), carrier: 'DTDC' });
  expect(order.payments).toMatchObject([{ kind: 'RECEIPT', method: 'UPI', reference: 'UPI-E2E-771', amountMinor: BigInt(180_000) }]);
  expect(order.taxDocuments).toMatchObject([{ kind: 'INVOICE', totalMinor: BigInt(180_000), supplyKind: 'INTRA_STATE' }]);
});

test('the buyer receives it and returns a box; the seller refunds it with a credit note', async ({ browser }) => {
  const buyerPage = await signIn(browser, buyer);
  await buyerPage.goto(`/orders/${state.orderId}`);
  await expect(buyerPage.getByText(/Recorded as paid: ₹1,800\.00 of ₹1,800\.00/)).toBeVisible({ timeout: 120_000 });
  await expect(buyerPage.getByText('Payments are recorded by the seller. Toothlogy did not take or pass on this money.')).toBeVisible();
  await nextSteps(buyerPage).getByRole('button', { name: 'I received it' }).click();
  await expect(buyerPage.getByText('Thanks — marked as received.')).toBeVisible({ timeout: 60_000 });
  await nextSteps(buyerPage).getByRole('button', { name: 'Return items' }).click();
  await nextSteps(buyerPage).getByLabel(/how many to return/).fill('1');
  await nextSteps(buyerPage).getByRole('button', { name: 'Ask to return' }).click();
  await expect(buyerPage.getByText('Return requested. The seller has been told.')).toBeVisible({ timeout: 60_000 });

  const sellerPage = await signIn(browser, seller);
  await sellerPage.goto(`/orders/${state.orderId}`);
  await nextSteps(sellerPage).getByRole('button', { name: 'Approve return' }).click();
  await expect(sellerPage.getByText('Return approved. The buyer has been told.')).toBeVisible({ timeout: 60_000 });
  await nextSteps(sellerPage).getByRole('button', { name: 'Returned items received' }).click();
  await expect(sellerPage.getByText('Items received. The credit note was issued.')).toBeVisible({ timeout: 60_000 });
  await nextSteps(sellerPage).getByRole('button', { name: 'Record the refund' }).click();
  await expect(nextSteps(sellerPage).getByLabel('Amount (rupees)')).toHaveValue('450.00');
  await nextSteps(sellerPage).getByRole('button', { name: 'Record', exact: true }).click();
  await expect(sellerPage.getByText('Refund recorded. The buyer has been told.')).toBeVisible({ timeout: 60_000 });
  await expect(sellerPage.getByRole('region', { name: 'Tax documents' }).getByRole('link', { name: /^Credit note CN/ })).toBeVisible();

  const order = await prisma.order.findUniqueOrThrow({ where: { id: state.orderId }, include: { returns: true, taxDocuments: { orderBy: { issuedAt: 'asc' } } } });
  expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PARTLY_REFUNDED', refundedMinor: BigInt(45_000) });
  expect(order.returns).toMatchObject([{ status: 'REFUNDED', refundMinor: BigInt(45_000) }]);
  expect(order.taxDocuments.map((d) => d.kind)).toEqual(['INVOICE', 'CREDIT_NOTE']);
});
