/**
 * TL-TEST-E2E-ENTERPRISE-001 — exchange rates and an enterprise agreement in
 * a real browser.
 *
 * Staff: record an exchange rate; put a clinic into a chain; record the
 * chain's agreement (four-hour first response, single sign-on required).
 * Member clinic: asks for help about the clinic — the request carries the
 * agreement's service levels, and staff see the deadline in the queue.
 * Chain administrator: sees the agreement, its results, sign-on not yet
 * connected, the hosting region undeclared (this deployment sets none), and
 * the member clinic — on a phone too.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the staff account gets the platform_admin role; the chain and
 * the clinic (each with its administrator) are created. Passwords are
 * generated per run. Needs the development DATABASE_URL.
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
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-ent-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const staffUser = person('Staff');
const chainUser = person('Chain');
const clinicUser = person('Clinic');
const chainName = `E2E Smile Chain ${stamp}`;
const clinicName = `E2E Chain Clinic ${stamp}`;
const reference = `ENT-E2E-${stamp}`;
const state = { chainId: '', clinicId: '' };

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

async function organization(userId: string, name: string, slug: string) {
  const organizationId = id('org');
  await prisma.organization.create({ data: { id: organizationId, type: 'CLINIC', name, slug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId, organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'clinic_admin', organizationId } });
  return organizationId;
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

test('staff record a rate, group a clinic under a chain, and record the chain’s agreement', async ({ browser }) => {
  const staff = await register(browser, staffUser);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: staff.userId, roleKey: 'platform_admin' } });
  const chain = await register(browser, chainUser);
  state.chainId = await organization(chain.userId, chainName, `e2e-smile-chain-${stamp}`);
  const clinic = await register(browser, clinicUser);
  state.clinicId = await organization(clinic.userId, clinicName, `e2e-chain-clinic-${stamp}`);

  const page = await signIn(browser, staffUser);
  await page.getByRole('link', { name: 'Exchange rates (staff)' }).click();
  const record = page.getByRole('region', { name: 'Record a rate' });
  await expect(record).toBeVisible({ timeout: 120_000 });
  await record.getByLabel('One unit of').selectOption('USD');
  await record.getByLabel('In', { exact: true }).selectOption('INR');
  await record.getByLabel(/^Rate/).fill('83.25');
  await record.getByLabel(/^Source/).fill('RBI reference rate (E2E)');
  // A rate is unique per pair and date, so each run records its own date.
  await record.getByLabel('As of').fill(day(-(400 + Math.floor(Math.random() * 3000))));
  await record.getByRole('button', { name: 'Record rate' }).click();
  await expect(page.getByText('Rate recorded.')).toBeVisible({ timeout: 60_000 });

  await page.goto('/admin/enterprise');
  const groups = page.getByRole('region', { name: 'Groups' });
  await expect(groups).toBeVisible({ timeout: 120_000 });
  await groups.getByLabel('Organization').selectOption({ label: clinicName });
  await groups.getByLabel('Into group').selectOption({ label: chainName });
  await groups.getByLabel('Reason').fill('Signed group contract');
  await groups.getByRole('button', { name: 'Add to the group' }).click();
  await expect(page.getByText('Added to the group.')).toBeVisible({ timeout: 60_000 });

  const form = page.getByRole('region', { name: 'Record an agreement' });
  // Exact: the sign-on checkbox's label mentions "the group’s identity provider".
  await form.getByLabel('Group', { exact: true }).selectOption({ label: chainName });
  await form.getByLabel(/^Contract reference/).fill(reference);
  await form.getByLabel(/^Ends/).fill(day(365));
  await form.getByRole('checkbox', { name: /Single sign-on/ }).check();
  await form.getByRole('button', { name: 'Record agreement' }).click();
  await expect(page.getByText('Agreement recorded. The group has been told.')).toBeVisible({ timeout: 60_000 });
  const listed = page.getByRole('list', { name: 'Agreements' }).getByRole('listitem').filter({ hasText: reference });
  await expect(listed.getByText('Required — enterprise sign-in is not connected yet')).toBeVisible();

  expect(await prisma.organization.findUniqueOrThrow({ where: { id: state.clinicId } })).toMatchObject({ parentOrganizationId: state.chainId });
  expect(await prisma.enterpriseAgreement.findFirstOrThrow({ where: { organizationId: state.chainId } })).toMatchObject({ reference, status: 'ACTIVE', firstResponseHours: 4, ssoRequired: true });
});

test('a member clinic’s help request carries the agreement’s service levels', async ({ browser }) => {
  const page = await signIn(browser, clinicUser);
  await page.goto('/help');
  await page.getByLabel('For (optional)').selectOption({ label: clinicName });
  await page.getByLabel('Title', { exact: true }).fill(`Receptionist invite expired ${stamp}`);
  await page.getByLabel(/^What happened\?/).fill('The invitation link says it has expired when our receptionist opens it.');
  await page.getByRole('button', { name: 'Send to Toothlogy' }).click();
  await page.waitForURL('**/help/tickets/**', { timeout: 120_000 });

  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { organizationId: state.clinicId } });
  expect(ticket.enterpriseAgreementId).not.toBeNull();
  expect(ticket.slaFirstResponseDueAt!.getTime() - ticket.createdAt.getTime()).toBeGreaterThanOrEqual(4 * 3_600_000 - 5_000);

  const staff = await signIn(browser, staffUser);
  await staff.goto('/admin/support');
  const item = staff.getByRole('region', { name: `Receptionist invite expired ${stamp}` });
  await expect(item.getByText(/enterprise SLA: first reply due/)).toBeVisible({ timeout: 120_000 });
});

test('the chain sees its agreement, results and member clinic', async ({ browser }) => {
  const page = await signIn(browser, chainUser);
  await page.goto(`/account/organizations/${state.chainId}`);
  await page.getByRole('link', { name: 'Enterprise agreement' }).click();
  await expect(page.getByRole('heading', { name: 'Enterprise agreement' })).toBeVisible({ timeout: 120_000 });
  const agreement = page.getByRole('region', { name: 'Agreement' });
  await expect(agreement.getByText(`Agreement ${reference}`)).toBeVisible();
  await expect(agreement.getByText('First response within 4 hours, resolution within 48 hours')).toBeVisible();
  await expect(agreement.getByText('Results (1 requests)')).toBeVisible();
  await expect(agreement.getByText('Hosting region not declared')).toBeVisible();
  await expect(agreement.getByText('Required — enterprise sign-in is not connected yet')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Members' }).getByText(clinicName)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
