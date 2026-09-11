/**
 * TL-TEST-E2E-COUNTRIES-001 — the market-opening console in a real browser.
 *
 * A platform administrator sees India open with every readiness check done,
 * and closed countries with what they still need (no switch to open a
 * country that is not ready); the page fits a phone. Anyone else gets a 404.
 * Read-only: switching is covered by the integration test, and the shared
 * development database's India stays open.
 *
 * Fixture steps, as direct database writes: the new account's email is
 * marked verified; it gets the platform_admin role, removed afterwards.
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
const who = { name: `Ops Country${stamp}`, email: `e2e-ctry-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const roleId = `ra_e2e_${stamp}_ctry`;

test.afterAll(async () => {
  await prisma.roleAssignment.deleteMany({ where: { id: roleId } });
  await prisma.$disconnect();
});

test('staff see which countries are ready; others get a 404', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(who.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email: who.email }, data: { emailVerifiedAt: new Date() } });

  expect((await page.goto('/admin/countries'))?.status()).toBe(404);
  await prisma.roleAssignment.create({ data: { id: roleId, userId: user.id, roleKey: 'platform_admin' } });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/countries');
  await expect(page.getByRole('heading', { level: 1, name: 'Countries (staff)' })).toBeVisible({ timeout: 120_000 });
  const india = page.getByRole('region', { name: 'India' });
  await expect(india.getByText('open', { exact: true })).toBeVisible();
  const checks = india.getByRole('list', { name: 'Readiness of India' }).getByRole('listitem');
  await expect(checks).toHaveCount(6);
  await expect(india.getByText(' — done')).toHaveCount(6);
  await expect(india.getByRole('button', { name: 'Close India to new organizations' })).toBeDisabled();

  const closed = await prisma.country.findFirst({ where: { enabled: false }, orderBy: { name: 'asc' } });
  if (closed) {
    const card = page.getByRole('region', { name: closed.name });
    await expect(card.getByText('closed', { exact: true })).toBeVisible();
    await expect(card.getByText(/Configure what is missing before opening/)).toBeVisible();
    await expect(card.getByRole('button', { name: `Open ${closed.name}` })).toHaveCount(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
