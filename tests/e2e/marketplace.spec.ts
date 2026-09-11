/**
 * TL-TEST-E2E-MARKETPLACE-001 — a dental business and a buyer in a real browser.
 *
 * Seller: fills in the trading profile (category, district served) and
 * publishes a product. Buyer: finds it in the marketplace by category (the
 * page fits a phone), asks the seller for a quote, sees it waiting. Seller:
 * sends a quote. Buyer: accepts it and is told to arrange payment and
 * delivery with the seller — no money moves through Toothlogy.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified, and the business (organization and administrator membership) is
 * created for the seller's account. Passwords are generated per run. Needs
 * the development DATABASE_URL (from .env.local).
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
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-mkt-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const seller = person('Seller');
const buyer = person('Buyer');
const businessName = `E2E Dental Supplies ${stamp}`;
const productName = `E2E Nitrile Gloves ${stamp}`;
const state = { organizationId: '', slug: `e2e-dental-supplies-${stamp}` };

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

test('a business sets up its profile and publishes a product', async ({ browser }) => {
  const { page, userId } = await register(browser, seller);
  state.organizationId = id('org');
  await prisma.organization.create({ data: { id: state.organizationId, type: 'SUPPLIER', name: businessName, slug: state.slug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId, organizationId: state.organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await page.goto(`/account/organizations/${state.organizationId}`);
  await page.getByRole('region', { name: 'Marketplace' }).getByRole('link', { name: 'Catalogue' }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue', exact: true })).toBeVisible({ timeout: 120_000 });

  await page.getByRole('checkbox', { name: 'Consumables' }).check();
  await page.getByRole('checkbox', { name: 'Raipur, Chhattisgarh' }).check();
  await page.getByLabel(/^Brands/).fill('SafeTouch');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByLabel('Name', { exact: true }).fill(productName);
  await page.getByLabel(/^Unit/).fill('box of 100');
  await page.getByLabel(/^Indicative price/).fill('450');
  await page.getByLabel('Minimum order', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Add to catalogue' }).click();
  await expect(page.getByText('Added as a draft. Publish it when the details are right.')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('list', { name: 'Catalogue' }).getByRole('listitem').filter({ hasText: productName }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published: buyers can see it and ask for a quote.')).toBeVisible({ timeout: 60_000 });

  const product = await prisma.product.findFirstOrThrow({ where: { organizationId: state.organizationId } });
  expect(product).toMatchObject({ status: 'PUBLISHED', priceMinor: BigInt(45_000), minOrderQuantity: 5, category: 'consumables' });
});

test('a buyer finds the product and asks for a quote', async ({ browser }) => {
  const { page } = await register(browser, buyer);
  await page.goto('/marketplace?category=consumables');
  await expect(page.getByRole('heading', { name: 'Dental marketplace' })).toBeVisible({ timeout: 120_000 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  const listing = page.getByRole('region', { name: productName });
  await expect(listing).toBeVisible({ timeout: 60_000 });
  await expect(listing.getByText(/per box of 100 \(indicative\)/)).toBeVisible();
  await listing.getByRole('link', { name: businessName }).click();
  await expect(page.getByRole('heading', { name: businessName })).toBeVisible({ timeout: 120_000 });

  await page.getByLabel(/^Quantity/).fill('3');
  await page.getByRole('button', { name: 'Request a quote' }).click();
  await expect(page.getByText('Enter a whole number of at least 5.')).toBeVisible();
  await page.getByLabel(/^Quantity/).fill('10');
  await page.getByLabel(/^Details/).fill('Size M, deliver to Shankar Nagar');
  await page.getByRole('button', { name: 'Request a quote' }).click();
  await expect(page.getByText('Quote requested')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: 'My quotes' }).click();
  const mine = page.getByRole('region', { name: `${productName} from ${businessName}` });
  await expect(mine).toBeVisible({ timeout: 120_000 });
  await expect(mine.getByText('Waiting for a quote')).toBeVisible();
});

test('the seller quotes and the buyer accepts', async ({ browser }) => {
  const sellerPage = await signIn(browser, seller);
  await sellerPage.goto(`/account/organizations/${state.organizationId}/quotes`);
  const request = sellerPage.getByRole('listitem').filter({ hasText: buyer.name });
  await expect(request).toBeVisible({ timeout: 120_000 });
  await expect(request.getByText(/Size M, deliver to Shankar Nagar/)).toBeVisible();
  await request.getByRole('button', { name: 'Send quote' }).click();
  await request.getByLabel(/^Total/).fill('4200');
  await request.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(sellerPage.getByText('Quote sent. The buyer has been told.')).toBeVisible({ timeout: 60_000 });

  const buyerPage = await signIn(browser, buyer);
  await buyerPage.goto('/account/quotes');
  const mine = buyerPage.getByRole('region', { name: `${productName} from ${businessName}` });
  await expect(mine.getByText(/Quote: ₹4,200\.00 in all, GST included/)).toBeVisible({ timeout: 120_000 });
  await mine.getByRole('button', { name: 'Accept quote' }).click();
  await expect(mine.getByText('Accepted', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(mine.getByText(/Arrange payment and delivery with/)).toBeVisible();

  const quote = await prisma.quoteRequest.findFirstOrThrow({ where: { sellerOrganizationId: state.organizationId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  expect(quote).toMatchObject({ status: 'ACCEPTED', quantity: 10, quotedPriceMinor: BigInt(420_000), openKey: null });
  expect(quote.events.map((e) => e.action)).toEqual(['REQUESTED', 'QUOTE', 'ACCEPT']);
});
