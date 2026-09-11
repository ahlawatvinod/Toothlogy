/**
 * TL-TEST-E2E-KNOWLEDGE-001 — the knowledge library in a real browser.
 *
 * A verified dentist writes a condition article with a source and sends it
 * for review; a reviewer publishes it; a signed-out reader finds it by search,
 * reads it on a phone-sized screen with its sources, byline and structured
 * data.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the author's dentist profile is recorded as verified
 * (verification has its own specs); the reviewer gets the medical_reviewer
 * role. Afterwards the article is archived so the development library does
 * not fill with test articles.
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
const person = (first: string) => ({ name: `${first} Writer${stamp}`, email: `e2e-kb-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const author = person('Anita');
const reviewer = person('Rohan');
const title = `Tooth sensitivity explained ${stamp}`;
const BODY = [
  '## What it is',
  'Tooth sensitivity is a short, sharp pain when teeth meet cold, heat, sweet or acidic food, or even brushing. It usually comes from exposed dentine.',
  '## What helps',
  '- A desensitising toothpaste, twice daily',
  '- A soft brush and a gentle technique',
  'See a dentist if it lasts more than a few weeks.',
].join('\n\n');
const state = { articleId: '', slug: '' };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  if (state.articleId) {
    await prisma.article.updateMany({ where: { id: state.articleId, status: { not: 'ARCHIVED' } }, data: { status: 'ARCHIVED', archivedAt: new Date(), archivedReason: 'End-to-end test article.' } });
  }
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof author): Promise<{ page: Page; userId: string }> {
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

test('a verified dentist writes an article with a source and sends it for review', async ({ browser }) => {
  const { page, userId } = await register(browser, author);
  await prisma.roleAssignment.create({ data: { id: `ra_e2e_${stamp}_a`, userId, roleKey: 'dentist' } });
  await prisma.dentistProfile.create({ data: { id: `prf_e2e_${stamp}_kb`, userId, slug: `e2e-kb-${stamp}`, languages: ['en'], status: 'VERIFIED', isVerified: true, verifiedAt: new Date() } });

  await page.goto('/account/articles');
  const start = page.getByRole('region', { name: 'Start an article' });
  await expect(start).toBeVisible({ timeout: 120_000 });
  await start.getByLabel('Title', { exact: true }).fill(title);
  await start.getByLabel('Summary').fill('Why teeth hurt with cold drinks, and what helps.');
  await start.getByLabel('Text', { exact: true }).fill(BODY);
  const source = start.getByRole('listitem', { name: 'Source 1' });
  await source.getByLabel('Source title').fill('Dentine hypersensitivity: management guidance');
  await source.getByLabel('Published in').fill('British Dental Journal');
  await source.getByLabel('Year').fill('2021');
  await start.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForURL(/\/account\/articles\/art_/, { timeout: 120_000 });
  state.articleId = page.url().split('/').pop()!;

  await page.getByRole('button', { name: 'Save and send for review' }).click();
  await expect(page.getByText('Sent for review.', { exact: false })).toBeVisible({ timeout: 60_000 });
  const row = await prisma.article.findUniqueOrThrow({ where: { id: state.articleId } });
  expect(row).toMatchObject({ status: 'IN_REVIEW', kind: 'CONDITION', liveTitle: null });
  state.slug = row.slug;
  // Not public while under review.
  expect((await page.goto(`/knowledge/${row.slug}`))?.status()).toBe(404);
});

test('a reviewer publishes it; a signed-out reader finds and reads it on a phone', async ({ browser }) => {
  const { page, userId } = await register(browser, reviewer);
  await prisma.roleAssignment.create({ data: { id: `ra_e2e_${stamp}_r`, userId, roleKey: 'medical_reviewer' } });
  await page.goto('/admin/knowledge');
  const waiting = page.getByRole('list', { name: 'Waiting for review' });
  await expect(waiting).toBeVisible({ timeout: 120_000 });
  await waiting.getByRole('link', { name: title }).click();
  await page.waitForURL(`**/admin/knowledge/${state.articleId}`, { timeout: 120_000 });
  await expect(page.getByRole('list', { name: 'Sources' }).getByText('Dentine hypersensitivity: management guidance')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('region', { name: 'Decision' }).getByRole('button', { name: 'Publish' }).click();
  await page.waitForURL('**/admin/knowledge', { timeout: 120_000 });

  const reader = await (await browser.newContext()).newPage();
  await reader.setViewportSize({ width: 375, height: 812 });
  await reader.goto(`/knowledge?q=${encodeURIComponent(stamp)}`);
  const results = reader.getByRole('list', { name: 'Articles' });
  await expect(results.getByRole('link', { name: title })).toBeVisible({ timeout: 120_000 });
  await results.getByRole('link', { name: title }).click();
  await reader.waitForURL(`**/knowledge/${state.slug}`, { timeout: 120_000 });
  await expect(reader.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 60_000 });
  await expect(reader.getByRole('heading', { level: 2, name: 'What helps' })).toBeVisible();
  await expect(reader.getByText(`clinically reviewed by ${reviewer.name}`, { exact: false })).toBeVisible();
  await expect(reader.getByRole('list', { name: 'Sources' }).getByText('British Dental Journal', { exact: false })).toBeVisible();
  const ld = JSON.parse((await reader.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}');
  expect(ld).toMatchObject({ '@type': 'MedicalWebPage', name: title, reviewedBy: { name: reviewer.name } });
  expect(await reader.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
