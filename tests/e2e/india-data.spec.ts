/**
 * TL-TEST-E2E-INDIA-DATA-001 — directory data and activation in a real browser.
 *
 * Activation: the start form answers the same for any email and mobile; a
 * bad link is refused; the page fits a phone. Staff console: an ordinary
 * account gets a 404; a staff account imports a CSV of clinics, sees the
 * row unverified in the review queue, and turns it into an unowned, pending
 * listing in its district.
 *
 * Fixture steps, both direct database writes because no email provider is
 * connected and staff roles are not self-service: the new account's email is
 * marked verified, and the platform_admin role is granted to it. Everything
 * else goes through the pages and the API. Needs only the development
 * DATABASE_URL (from .env.local) for assertions.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

function envLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '');
}

const prisma = new PrismaClient({ datasources: { db: { url: envLocal('DATABASE_URL') } } });
const stamp = Date.now().toString(36);
const staff = { name: `E2E Data Staff ${stamp}`, email: `e2e-data-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const clinicName = `E2E Smile Dental ${stamp}`;

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('activation answers the same for anyone, refuses a bad link, and fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/activate');
  await expect(page.getByRole('heading', { name: 'Activate your profile' })).toBeVisible({ timeout: 120_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByLabel(/^Email address/).fill(`nobody-${stamp}@example.test`);
  await page.getByLabel(/^Mobile number/).fill('9000000000');
  await page.getByRole('button', { name: 'Send link and code' }).click();
  await expect(page.getByText(/If a Toothlogy profile matches this email address and mobile number/)).toBeVisible({ timeout: 60_000 });

  await page.goto(`/activate?token=${'x'.repeat(40)}`);
  await page.getByLabel(/^Code from the SMS/).fill('123456');
  await page.locator('input[autocomplete="new-password"]').first().fill('a sufficiently long passphrase');
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('a sufficiently long passphrase');
  await page.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText('Accept the terms of use to continue.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText(/invalid, used or expired/)).toBeVisible({ timeout: 60_000 });
});

test('staff import a clinic CSV, review it unverified, and create an unowned listing', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(staff.name);
  await page.getByLabel('Email address').fill(staff.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(staff.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email: staff.email }, data: { emailVerifiedAt: new Date() } });

  // Not staff yet: the console does not exist for this account.
  const denied = await page.goto('/admin/data');
  expect(denied?.status()).toBe(404);

  await prisma.roleAssignment.create({ data: { id: `ra_e2e_${stamp}`, userId: user.id, roleKey: 'platform_admin' } });
  // Staff reach the console from their account navigation.
  await page.goto('/account');
  await page.getByRole('link', { name: 'Directory data (staff)' }).click();
  await expect(page.getByRole('heading', { name: 'Directory data (staff)' })).toBeVisible({ timeout: 120_000 });

  await page.getByLabel(/^Source/).fill(`E2E clinic survey ${stamp}`);
  await page.getByLabel('Rows are').selectOption('CLINIC');
  await page
    .getByLabel('…or paste CSV')
    .first()
    .fill(`Clinic Name,Phone,Address,City,Pincode,District,State\n"${clinicName}",98270 ${stamp.slice(-5).replace(/\D/g, '0').padStart(5, '1')},Station Road,Raipur,492 001,Raipur,Chhattisgarh\n`);
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByText(/1 rows: 1 new, 0 duplicate, 0 rejected\. All unverified\./)).toBeVisible({ timeout: 60_000 });

  const row = page.getByRole('row', { name: new RegExp(clinicName) });
  await expect(row).toBeVisible();
  await expect(row.getByText('unverified')).toBeVisible();
  await expect(row.getByText('Raipur, Chhattisgarh')).toBeVisible();
  await row.getByRole('button', { name: 'Create unowned listing' }).click();
  await expect(page.getByRole('row', { name: new RegExp(clinicName) })).toHaveCount(0, { timeout: 60_000 });

  const record = await prisma.extractedRecord.findFirstOrThrow({ where: { name: clinicName }, include: { premadeOrganization: { include: { locations: { include: { district: true } } } } } });
  expect(record.status).toBe('ACCOUNT_CREATED');
  expect(record.verification).toBe('UNVERIFIED');
  expect(record.premadeOrganization).toMatchObject({ status: 'PENDING', ownerUserId: null, type: 'CLINIC' });
  expect(record.premadeOrganization?.locations[0]?.district?.name).toBe('Raipur');
});
