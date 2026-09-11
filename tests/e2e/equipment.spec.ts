/**
 * TL-TEST-E2E-EQUIPMENT-001 — equipment register and a maintenance contract
 * in a real browser.
 *
 * Practice: registers an X-ray unit with its warranty. Service business
 * (listed as that unit's supplier, so they have traded): proposes an AMC.
 * Practice: accepts it covering the X-ray unit, and requests a preventive
 * visit. Business: schedules and completes it with a report. Practice: sees
 * the report, on a phone-sized screen too.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the two organizations (with administrator memberships) are
 * created for the accounts; the unit's supplier is set to the business.
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
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-eq-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const practiceUser = person('Practice');
const providerUser = person('Provider');
const practiceName = `E2E Smile Clinic ${stamp}`;
const providerName = `E2E Service Co ${stamp}`;
const unit = `E2E X-ray unit ${stamp}`;
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const state = { practiceId: '', providerId: '' };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof practiceUser): Promise<{ page: Page; userId: string }> {
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

async function signIn(browser: Browser, who: typeof practiceUser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

async function organization(userId: string, type: 'CLINIC' | 'SUPPLIER', name: string) {
  const organizationId = id('org');
  await prisma.organization.create({ data: { id: organizationId, type, name, slug: `${type.toLowerCase()}-e2e-${stamp}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId, organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'clinic_admin', organizationId } });
  return organizationId;
}

test('a practice registers equipment with its warranty', async ({ browser }) => {
  const provider = await register(browser, providerUser);
  state.providerId = await organization(provider.userId, 'SUPPLIER', providerName);
  const { page, userId } = await register(browser, practiceUser);
  state.practiceId = await organization(userId, 'CLINIC', practiceName);

  await page.goto(`/account/organizations/${state.practiceId}`);
  await page.getByRole('region', { name: 'Equipment register', exact: true }).getByRole('link', { name: 'Equipment register', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Equipment', exact: true })).toBeVisible({ timeout: 120_000 });
  const add = page.getByRole('region', { name: 'Add equipment' });
  await add.getByLabel(/^Equipment/).fill(unit);
  await add.getByLabel('Kind').selectOption({ label: 'Imaging and X-ray' });
  await add.getByLabel(/^Serial number/).fill(`XR-${stamp}`);
  await add.getByLabel(/^Bought on/).fill(day(-100));
  await add.getByLabel(/^Warranty until/).fill(day(265));
  await add.getByRole('button', { name: 'Add equipment' }).click();
  await expect(page.getByText('Added to the register.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Equipment' }).getByText(unit)).toBeVisible();

  const asset = await prisma.equipmentAsset.findFirstOrThrow({ where: { organizationId: state.practiceId } });
  expect(asset).toMatchObject({ name: unit, category: 'imaging', serialNumber: `XR-${stamp}`, status: 'IN_USE' });
  // They have traded: the business supplied the unit.
  await prisma.equipmentAsset.update({ where: { id: asset.id }, data: { supplierOrganizationId: state.providerId } });
});

test('the service business proposes an AMC and the practice accepts it', async ({ browser }) => {
  const provider = await signIn(browser, providerUser);
  await provider.goto(`/account/organizations/${state.providerId}/service-contracts`);
  const propose = provider.getByRole('region', { name: 'Propose a contract' });
  await expect(propose).toBeVisible({ timeout: 120_000 });
  await propose.getByLabel(/^Practice/).selectOption({ label: practiceName });
  await propose.getByLabel(/^Ends/).fill(day(365));
  await propose.getByLabel('Preventive visits included').fill('2');
  await propose.getByLabel(/^Breakdown response/).fill('24');
  await propose.getByLabel(/^Price/).fill('18000');
  await propose.getByLabel(/^Terms/).fill('Two preventive visits a year; breakdown calls answered within 24 hours.');
  await propose.getByRole('button', { name: 'Propose contract' }).click();
  await expect(provider.getByText('Proposed. The practice has been told.')).toBeVisible({ timeout: 60_000 });

  const practice = await signIn(browser, practiceUser);
  await practice.goto(`/account/organizations/${state.practiceId}/equipment`);
  const contract = practice.getByRole('region', { name: `AMC with ${providerName}` });
  await expect(contract).toBeVisible({ timeout: 120_000 });
  await expect(contract.getByText('₹18,000.00', { exact: false })).toBeVisible();
  await contract.getByRole('checkbox', { name: unit }).check();
  await contract.getByRole('button', { name: 'Accept contract' }).click();
  await expect(practice.getByText('Contract accepted. The business has been told.')).toBeVisible({ timeout: 60_000 });
  await expect(contract.getByText(`Covers ${unit}`)).toBeVisible({ timeout: 60_000 });
  await contract.getByRole('button', { name: 'Request visit' }).click();
  await expect(practice.getByText('Visit requested. The business has been told.')).toBeVisible({ timeout: 60_000 });

  const saved = await prisma.serviceContract.findFirstOrThrow({ where: { clientOrganizationId: state.practiceId }, include: { assets: true, visits: true } });
  expect(saved).toMatchObject({ kind: 'AMC', status: 'ACTIVE', visitsIncluded: 2, responseHours: 24, priceMinor: BigInt(1_800_000) });
  expect(saved.assets).toHaveLength(1);
  expect(saved.visits).toMatchObject([{ kind: 'PREVENTIVE', status: 'REQUESTED' }]);
});

test('the business schedules and completes the visit; the practice sees the report', async ({ browser }) => {
  const provider = await signIn(browser, providerUser);
  // Surface anything that would stop the page becoming interactive.
  provider.on('pageerror', (error) => console.log(`[browser pageerror] ${error.message}`));
  provider.on('console', (message) => {
    if (message.type() === 'error') console.log(`[browser console.error] ${message.text()}`);
  });
  await provider.goto(`/account/organizations/${state.providerId}/service-contracts`);
  const contract = provider.getByRole('region', { name: `AMC for ${practiceName}` });
  await expect(contract).toBeVisible({ timeout: 120_000 });
  // Playwright's fill() on a datetime-local input assigns the value in a way
  // React's change tracking does not see (checked by hand: the page works with
  // real input). Set it as the browser does for a real change, then click.
  // Retried: a refresh from the previous step can remount the form (and its
  // state) just after the value is set.
  await expect(async () => {
    await contract.getByLabel('Visit on').evaluate((element, value) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, `${day(3)}T10:30`);
    await expect(contract.getByRole('button', { name: 'Schedule' })).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await contract.getByRole('button', { name: 'Schedule' }).click();
  await expect(provider.getByText('Scheduled. The practice has been told.')).toBeVisible({ timeout: 60_000 });
  await contract.getByLabel('Work done').fill('Calibrated exposure timer, checked tube head and collimator.');
  await contract.getByRole('button', { name: 'Mark completed' }).click();
  await expect(provider.getByText('Completed. The practice has been told.')).toBeVisible({ timeout: 60_000 });

  const practice = await signIn(browser, practiceUser);
  await practice.goto(`/account/organizations/${state.practiceId}/equipment`);
  const mine = practice.getByRole('region', { name: `AMC with ${providerName}` });
  await expect(mine.getByText(/Work done: Calibrated exposure timer/)).toBeVisible({ timeout: 120_000 });
  await expect(mine.getByText(/preventive visits 1 of 2 used/)).toBeVisible();
  await practice.setViewportSize({ width: 375, height: 812 });
  expect(await practice.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const visit = await prisma.serviceVisit.findFirstOrThrow({ where: { contract: { clientOrganizationId: state.practiceId } } });
  expect(visit).toMatchObject({ status: 'COMPLETED', report: 'Calibrated exposure timer, checked tube head and collimator.' });
  expect(await prisma.inAppNotification.count({ where: { notificationId: 'TL-NOTIF-SERVICE-CONTRACT-001', user: { email: practiceUser.email } } })).toBe(3); // proposed, scheduled, completed
});
