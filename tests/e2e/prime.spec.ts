/**
 * TL-TEST-E2E-PRIME-001 — Prime membership in a real browser.
 *
 * Staff: create a plan (price before tax, period, benefits) and put it on
 * sale. Practice owner: sees it with its tax, joins from the lead wallet,
 * sees the membership and its benefits (on a phone too), and turns renewal
 * off.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the staff account is given the platform_admin role; the practice
 * (organization with the owner as administrator) is created, and its lead
 * wallet is credited with a recorded transfer (a TOP_UP ledger entry and the
 * matching balance) — the step a staff member does from the billing console.
 * Passwords are generated per run. Needs the development DATABASE_URL.
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
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-prime-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const staffUser = person('Staff');
const ownerUser = person('Owner');
const planName = `E2E Prime Clinic ${stamp}`;
const clinicName = `E2E Prime Smile ${stamp}`;
const state = { organizationId: '' };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof staffUser): Promise<{ page: Page; userId: string }> {
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

async function signIn(browser: Browser, who: typeof staffUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

test('staff create a Prime plan and put it on sale', async ({ browser }) => {
  const { userId } = await register(browser, staffUser);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'platform_admin' } });
  const page = await signIn(browser, staffUser);
  await page.getByRole('link', { name: 'Prime plans (staff)' }).click();
  await expect(page.getByRole('heading', { name: 'Prime plans', exact: true })).toBeVisible({ timeout: 120_000 });

  const create = page.getByRole('region', { name: 'Create a plan' });
  await create.getByLabel(/^Plan name/).fill(planName);
  await create.getByLabel(/^Code/).fill(`e2e-prime-${stamp}`);
  await create.getByLabel(/^Price per period/).fill('10000');
  await create.getByLabel('Bonus free leads per period').fill('2');
  await create.getByRole('button', { name: 'Save draft plan' }).click();
  await expect(page.getByText('Plan saved as a draft. Put it on sale when it is right.')).toBeVisible({ timeout: 60_000 });

  const row = page.getByRole('list', { name: 'Plans' }).getByRole('listitem').filter({ hasText: planName });
  await expect(row.getByText(/₹11,800\.00 with tax/)).toBeVisible();
  await row.getByRole('button', { name: 'Put on sale' }).click();
  await expect(row.getByText('On sale.')).toBeVisible({ timeout: 60_000 });
  expect(await prisma.membershipPlan.findUniqueOrThrow({ where: { code: `e2e-prime-${stamp}` } })).toMatchObject({ status: 'ACTIVE', priceMinor: BigInt(1_000_000), periodMonths: 12, bonusFreeLeads: 2, primeBadge: true, prioritySupport: true });
});

test('a practice joins Prime from its lead wallet and turns renewal off', async ({ browser }) => {
  const { page, userId } = await register(browser, ownerUser);
  state.organizationId = id('org');
  await prisma.organization.create({ data: { id: state.organizationId, type: 'CLINIC', name: clinicName, slug: `e2e-prime-smile-${stamp}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId, organizationId: state.organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });
  const walletId = id('wal');
  await prisma.wallet.create({ data: { id: walletId, organizationId: state.organizationId, currency: 'INR', balanceMinor: BigInt(2_000_000) } });
  await prisma.ledgerEntry.create({ data: { id: id('lgr'), walletId, kind: 'TOP_UP', amountMinor: BigInt(2_000_000), balanceAfterMinor: BigInt(2_000_000), currency: 'INR', idempotencyKey: `e2e-topup-${stamp}`, externalReference: 'E2E-NEFT' } });

  await page.goto(`/account/organizations/${state.organizationId}`);
  await page.getByRole('region', { name: 'Prime', exact: true }).getByRole('link', { name: 'Prime membership' }).click();
  await expect(page.getByRole('heading', { name: 'Prime membership' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Paid from your lead wallet, which holds ₹20,000\.00/)).toBeVisible();

  const plan = page.getByRole('region', { name: planName });
  await expect(plan.getByText(/₹11,800\.00 for a year \(₹10,000\.00 \+ 18% GST ₹1,800\.00\)/)).toBeVisible();
  await plan.getByRole('button', { name: `Join ${planName}` }).click();
  await plan.getByRole('button', { name: 'Confirm and pay ₹11,800.00' }).click();
  // The page refreshes into the membership itself; the plan list (and its
  // passing confirmation) gives way to it.
  const mine = page.getByRole('region', { name: 'Your membership' });
  await expect(mine).toBeVisible({ timeout: 60_000 });
  await expect(mine.getByText('Prime member', { exact: true })).toBeVisible();
  await expect(mine.getByText('Bonus free leads this period: 0 of 2 used')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await mine.getByRole('button', { name: 'Turn renewal off' }).click();
  await expect(page.getByText(/Renewal is off\. Prime stays until/)).toBeVisible({ timeout: 60_000 });

  const membership = await prisma.membership.findFirstOrThrow({ where: { organizationId: state.organizationId } });
  expect(membership).toMatchObject({ status: 'ACTIVE', autoRenew: false, netMinor: BigInt(1_000_000), taxMinor: BigInt(180_000) });
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  expect(wallet.balanceMinor).toBe(BigInt(820_000));
  expect(await prisma.ledgerEntry.count({ where: { walletId, kind: 'MEMBERSHIP_CHARGE', amountMinor: BigInt(-1_180_000) } })).toBe(1);
});
