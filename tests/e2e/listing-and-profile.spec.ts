/**
 * TL-TEST-E2E-LISTING-PROFILE-001 — the Phase 3 screens that were API-only.
 *
 * - Someone who runs a clinic Toothlogy listed from public information claims
 *   it from the public page, with a document; the claim awaits review.
 * - A clinic's administrator edits its profile, adds a logo and a branch
 *   photo; the public clinic page shows them.
 * - A dentist opens their own numbers; someone without a dentist profile gets
 *   a 404.
 *
 * Fixtures written directly: the organizations, locations and memberships
 * (their own screens have their own tests), a dentist profile, and verified
 * emails (no email provider is connected).
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
const id = (prefix: string) => `${prefix}_e2e${stamp}${Math.random().toString(36).slice(2, 8)}`;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(7)]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, label: string): Promise<{ page: Page; userId: string }> {
  const email = `e2e-${label}-${stamp}@example.test`;
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(`E2E ${label} ${stamp}`);
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(`e2e passphrase ${randomUUID()}`);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return { page, userId: user.id };
}

async function clinic(name: string, ownerUserId: string | null) {
  const organizationId = id('org');
  const slug = `e2e-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`;
  await prisma.organization.create({ data: { id: organizationId, type: 'CLINIC', name: `${name} ${stamp}`, slug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId } });
  const locationId = id('loc');
  await prisma.location.create({ data: { id: locationId, organizationId, name: 'Main', slug: 'main', timezone: 'Asia/Kolkata', isPrimary: true } });
  if (ownerUserId) {
    await prisma.organizationMember.create({ data: { id: id('om'), userId: ownerUserId, organizationId, roleKey: 'clinic_admin', isPrimary: true } });
    await prisma.roleAssignment.create({ data: { id: id('ra'), userId: ownerUserId, roleKey: 'clinic_admin', organizationId } });
  }
  return { organizationId, locationId, slug, name: `${name} ${stamp}` };
}

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('someone who runs a listed clinic claims it with a document; the claim awaits review', async ({ browser }) => {
  const listing = await clinic('E2E Listed Clinic', null);
  const { page, userId } = await register(browser, 'claimant');

  await page.goto(`/clinics/${listing.slug}`, { timeout: 120_000 });
  await page.getByRole('link', { name: 'Run this clinic? Claim this listing' }).click();
  await page.waitForURL(`**/account/claim/${listing.organizationId}`, { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: `Claim ${listing.name}` })).toBeVisible({ timeout: 120_000 });

  await page.getByLabel(/^Your role at the clinic/).fill('Owner and managing dentist');
  await page.getByLabel(/^Documents/).setInputFiles({ name: 'registration.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByText('Uploaded')).toBeVisible({ timeout: 60_000 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noOverflow(page)).toBe(true);
  await page.getByRole('button', { name: 'Submit claim' }).click();
  await expect(page.getByText('Claim submitted')).toBeVisible({ timeout: 60_000 });

  const claim = await prisma.verificationRequest.findFirstOrThrow({ where: { subjectType: 'ORGANIZATION_CLAIM', subjectId: listing.organizationId, submittedByUserId: userId } });
  expect(claim.status).toBe('PENDING');
  // Nothing is conferred until a reviewer approves.
  expect((await prisma.organization.findUniqueOrThrow({ where: { id: listing.organizationId } })).ownerUserId).toBeNull();
  await page.reload();
  await expect(page.getByText('Your claim is awaiting review')).toBeVisible();
});

test('an administrator edits the profile, adds a logo and a branch photo; the public page shows them', async ({ browser }) => {
  const { page, userId } = await register(browser, 'clinic-admin');
  const own = await clinic('E2E Profile Clinic', userId);

  await page.goto(`/account/organizations/${own.organizationId}`, { timeout: 120_000 });
  // Exact: the clinic's own name contains "Profile", and so does its members table.
  const profile = page.getByRole('region', { name: 'Profile', exact: true });
  await expect(profile).toBeVisible({ timeout: 120_000 });
  await profile.getByLabel('About the organization').fill('A family dental clinic near the bus stand, open seven days.');
  await profile.getByLabel('Website').fill('https://example.test/clinic');
  await profile.getByRole('button', { name: 'Save profile' }).click();
  await expect(profile.getByText('Saved.')).toBeVisible({ timeout: 60_000 });

  await profile.getByLabel('Logo', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(profile.getByText(/Logo saved/)).toBeVisible({ timeout: 60_000 });

  const photos = page.getByRole('region', { name: 'Photos of Main' });
  await photos.getByLabel('Add photos of Main').setInputFiles({ name: 'reception.png', mimeType: 'image/png', buffer: PNG });
  await expect(photos.getByText('Photo added.')).toBeVisible({ timeout: 60_000 });

  const saved = await prisma.organization.findUniqueOrThrow({ where: { id: own.organizationId } });
  expect([saved.description, saved.website]).toEqual(['A family dental clinic near the bus stand, open seven days.', 'https://example.test/clinic']);
  expect(saved.logoFileId).not.toBeNull();
  const location = await prisma.location.findUniqueOrThrow({ where: { id: own.locationId } });
  expect(location.photoFileIds).toHaveLength(1);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/clinics/${own.slug}`, { timeout: 120_000 });
  await expect(visitor.getByText('A family dental clinic near the bus stand, open seven days.')).toBeVisible();
  const photo = visitor.getByRole('img', { name: 'Main, photo 1' });
  await expect(photo).toBeVisible();
  expect((await visitor.request.get((await photo.getAttribute('src'))!)).status()).toBe(200);
  await visitor.setViewportSize({ width: 375, height: 812 });
  expect(await noOverflow(visitor)).toBe(true);
});

test('a dentist sees their own numbers; someone without a dentist profile gets a 404', async ({ browser }) => {
  const { page, userId } = await register(browser, 'numbers-dentist');
  // A dentist is a role and a profile: registration makes a patient, and the dentist pages need the role.
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'dentist' } });
  await prisma.dentistProfile.create({ data: { id: id('prf'), userId, slug: `e2e-numbers-${stamp}`, languages: ['en'] } });

  await page.goto('/account/dentist-profile', { timeout: 120_000 });
  await page.getByRole('link', { name: 'Your numbers' }).click();
  await page.waitForURL('**/account/dentist-profile/analytics', { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Your numbers' })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('No bookings in this period')).toBeVisible();
  await page.getByRole('link', { name: 'Last 7 days' }).click();
  await page.waitForURL('**/analytics?days=7');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noOverflow(page)).toBe(true);

  const { page: patient } = await register(browser, 'numbers-patient');
  expect((await patient.goto('/account/dentist-profile/analytics'))?.status()).toBe(404);
});
