/**
 * TL-TEST-E2E-ANALYTICS-001 — dashboards in a real browser.
 *
 * A visit to the E2E dentist's public profile is recorded (anonymously — the
 * visitor gave no analytics consent); the practice's administrator sees the
 * practice dashboard, whose view count is exactly what the database holds,
 * switches the period, and the page fits a phone. An operator sees platform
 * totals; anyone else gets a 404.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; one is made an administrator of the E2E practice's organization
 * (removed afterwards), another a platform administrator (removed afterwards).
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
const PRACTICE_ID = process.env.E2E_PRACTICE_ID ?? 'prc_01M25DCQ8G95D6E889F48TZ0EJ';
const stamp = Date.now().toString(36);
const person = (first: string) => ({ name: `${first} Stats${stamp}`, email: `e2e-an-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const admin = person('Owner');
const operator = person('Operator');
const state = { organizationId: '', dentistProfileId: '', dentistSlug: '', cleanup: [] as Array<() => Promise<unknown>> };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { dentistProfileId: true, dentistProfile: { select: { slug: true, isDiscoverable: true } }, location: { select: { organizationId: true } } } });
  test.skip(!practice || !practice.dentistProfile.isDiscoverable, 'Needs the development E2E practice with a discoverable dentist.');
  state.organizationId = practice!.location.organizationId;
  state.dentistProfileId = practice!.dentistProfileId;
  state.dentistSlug = practice!.dentistProfile.slug;
});

test.afterAll(async () => {
  for (const undo of state.cleanup) await undo().catch(() => {});
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof admin): Promise<{ page: Page; userId: string }> {
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

async function recordedViews(organizationId: string, since: Date) {
  const dentistIds = (await prisma.dentistPractice.findMany({ where: { location: { organizationId } }, select: { dentistProfileId: true }, distinct: ['dentistProfileId'] })).map((d) => d.dentistProfileId);
  return prisma.analyticsEvent.count({ where: { name: 'profile_viewed', subjectType: 'dentist', subjectId: { in: dentistIds }, occurredAt: { gte: since } } });
}

test('a profile visit is recorded, and the practice dashboard shows exactly what the records hold', async ({ browser }) => {
  const before = await prisma.analyticsEvent.count({ where: { name: 'profile_viewed', subjectId: state.dentistProfileId } });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/dentists/${state.dentistSlug}`);
  await expect(visitor.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 120_000 });
  await expect.poll(() => prisma.analyticsEvent.count({ where: { name: 'profile_viewed', subjectId: state.dentistProfileId } }), { timeout: 30_000 }).toBeGreaterThan(before);
  const latest = await prisma.analyticsEvent.findFirstOrThrow({ where: { name: 'profile_viewed', subjectId: state.dentistProfileId }, orderBy: { occurredAt: 'desc' } });
  expect(latest.actorKey).toBeNull(); // no consent, so no identity at all

  const side = await register(browser, admin);
  const membershipId = `om_e2e_${stamp}_an`;
  await prisma.organizationMember.create({ data: { id: membershipId, userId: side.userId, organizationId: state.organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: membershipId.replace('om_', 'ra_'), userId: side.userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });
  state.cleanup.push(() => prisma.organizationMember.deleteMany({ where: { id: membershipId } }), () => prisma.roleAssignment.deleteMany({ where: { id: membershipId.replace('om_', 'ra_') } }));

  const page = side.page;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/account/organizations/${state.organizationId}/analytics`);
  await expect(page.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible({ timeout: 120_000 });
  const expected = await recordedViews(state.organizationId, new Date(Date.now() - 30 * 86_400_000));
  const views = page.getByRole('region', { name: 'Reviews and views' });
  await expect(views.getByText('Dentist profile views')).toBeVisible();
  await expect(views.locator('dd').nth(2).locator('strong')).toHaveText(String(expected));
  await expect(page.getByRole('region', { name: 'Bookings' }).getByRole('img', { name: /^Bookings made: \d+ in 30 days/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('link', { name: 'Last 7 days' }).click();
  await page.waitForURL(/days=7/, { timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'Last 7 days' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('img', { name: /^Bookings made: \d+ in 7 days/ })).toBeVisible({ timeout: 60_000 });
});

test('an operator sees platform totals; anyone else gets a 404', async ({ browser }) => {
  const side = await register(browser, operator);
  const plain = side.page;
  expect((await plain.goto('/admin/analytics'))?.status()).toBe(404);
  const roleId = `ra_e2e_${stamp}_op`;
  await prisma.roleAssignment.create({ data: { id: roleId, userId: side.userId, roleKey: 'platform_admin' } });
  state.cleanup.push(() => prisma.roleAssignment.deleteMany({ where: { id: roleId } }));
  await plain.goto('/admin/analytics');
  await expect(plain.getByRole('heading', { level: 1, name: 'Platform analytics (staff)' })).toBeVisible({ timeout: 120_000 });
  const accounts = await prisma.user.count({ where: { deletedAt: null } });
  await expect(plain.getByRole('region', { name: 'People and trust' }).locator('dd').first().locator('strong')).toHaveText(String(accounts));
});
