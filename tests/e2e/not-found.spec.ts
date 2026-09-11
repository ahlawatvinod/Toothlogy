/**
 * TL-TEST-E2E-NOT-FOUND-001 — the 404s people actually meet.
 *
 * A signed-in person opening another organization's page gets a 404 inside
 * the signed-in layout (header kept, a way back to their account) — and the
 * page's console stays free of React's "Encountered a script tag" warning,
 * which the root-level fallback used to trigger by re-rendering the root
 * layout's pre-paint theme script. A visitor opening an unknown clinic gets
 * the public 404 with the site around it.
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

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('another organization’s page is a 404 inside the account layout, with no script-tag warning', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text());
  });
  const email = `e2e-404-${stamp}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill(`E2E 404 ${stamp}`);
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(`e2e passphrase ${randomUUID()}`);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });

  const someoneElses = await prisma.organization.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } });
  const response = await page.goto(`/account/organizations/${someoneElses.id}`, { timeout: 120_000 });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your account' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Account' })).toBeVisible();
  // Let hydration finish, then check the console.
  await page.waitForLoadState('networkidle');
  expect(warnings.filter((w) => /Encountered a script tag/i.test(w))).toEqual([]);
});

test('an unknown clinic is the public 404 with the site around it', async ({ page }) => {
  const response = await page.goto(`/clinics/no-such-clinic-${stamp}`, { timeout: 120_000 });
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a dentist', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});
