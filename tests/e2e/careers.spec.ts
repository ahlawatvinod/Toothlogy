/**
 * TL-TEST-E2E-CAREERS-001 — jobs and applications in a real browser.
 *
 * An employer posts a job as a draft and publishes it; a job seeker finds it,
 * reads it on a phone (with JobPosting structured data) and applies with a
 * résumé and consent; the employer sees the application with the résumé and
 * shortlists it; the applicant sees where it stands.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; a new account is made an administrator of the E2E practice's
 * organization (removed afterwards); if that organization is not verified,
 * it is marked verified for the run and restored afterwards; the test posting
 * is closed at the end so the development board stays clean.
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
const person = (first: string) => ({ name: `${first} Hire${stamp}`, email: `e2e-job-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const boss = person('Employer');
const seeker = person('Sana');
const title = `Associate dentist ${stamp}`;
const PDF = Buffer.from('%PDF-1.4\n% résumé for an end-to-end test\n%%EOF\n');
const state = { organizationId: '', organizationName: '', membershipId: '', restoreVerifiedAt: undefined as Date | null | undefined, postingId: '' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { location: { select: { organization: { select: { id: true, name: true, verifiedAt: true } } } } } });
  test.skip(!practice, 'Needs the development E2E practice.');
  const org = practice!.location.organization;
  state.organizationId = org.id;
  state.organizationName = org.name;
  if (!org.verifiedAt) {
    state.restoreVerifiedAt = null;
    await prisma.organization.update({ where: { id: org.id }, data: { verifiedAt: new Date() } });
  }
});

test.afterAll(async () => {
  if (state.postingId) await prisma.jobPosting.updateMany({ where: { id: state.postingId, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date() } });
  if (state.membershipId) {
    await prisma.organizationMember.deleteMany({ where: { id: state.membershipId } });
    await prisma.roleAssignment.deleteMany({ where: { id: state.membershipId.replace('om_', 'ra_') } });
  }
  if (state.restoreVerifiedAt === null) await prisma.organization.update({ where: { id: state.organizationId }, data: { verifiedAt: null } });
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof boss): Promise<{ page: Page; userId: string }> {
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

let employerPage: Page;
let seekerPage: Page;

test('an employer drafts a job and publishes it', async ({ browser }) => {
  const side = await register(browser, boss);
  employerPage = side.page;
  state.membershipId = `om_e2e_${stamp}_job`;
  await prisma.organizationMember.create({ data: { id: state.membershipId, userId: side.userId, organizationId: state.organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: state.membershipId.replace('om_', 'ra_'), userId: side.userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await employerPage.goto(`/account/organizations/${state.organizationId}/careers`);
  const form = employerPage.getByRole('region', { name: 'Post a job or internship' });
  await expect(form).toBeVisible({ timeout: 120_000 });
  await form.getByLabel('Job title').fill(title);
  await form.getByLabel('About the role').fill('A full-time associate for general dentistry, root canals and crowns. Five and a half days a week, one weekday off, mentoring from senior dentists.');
  await form.getByLabel(/^Pay from/).fill('45000');
  await form.getByLabel(/^Up to/).fill('70000');
  await form.getByRole('button', { name: 'Save as draft' }).click();
  await employerPage.waitForURL(/\/careers\/pst_/, { timeout: 120_000 });
  state.postingId = employerPage.url().split('/').pop()!;
  await employerPage.getByRole('button', { name: 'Publish' }).click();
  await expect(employerPage.getByRole('link', { name: 'its careers page' })).toBeVisible({ timeout: 60_000 });
  expect((await prisma.jobPosting.findUniqueOrThrow({ where: { id: state.postingId } })).status).toBe('OPEN');
});

test('a job seeker finds it on a phone and applies with a résumé', async ({ browser }) => {
  const side = await register(browser, seeker);
  seekerPage = side.page;
  await seekerPage.setViewportSize({ width: 375, height: 812 });
  await seekerPage.goto(`/careers?q=${encodeURIComponent(stamp)}`);
  const openings = seekerPage.getByRole('list', { name: 'Openings' });
  await expect(openings.getByRole('link', { name: title })).toBeVisible({ timeout: 120_000 });
  await expect(openings.getByText('₹45,000–₹70,000 a month', { exact: false })).toBeVisible();
  await openings.getByRole('link', { name: title }).click();
  await seekerPage.waitForURL(`**/careers/${state.postingId}`, { timeout: 120_000 });
  const ld = JSON.parse((await seekerPage.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}');
  expect(ld).toMatchObject({ '@type': 'JobPosting', title, employmentType: 'FULL_TIME', hiringOrganization: { name: state.organizationName } });

  const apply = seekerPage.getByRole('region', { name: 'Apply' });
  await apply.getByLabel(/^Résumé/).setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: PDF });
  await apply.getByLabel(/^A note to the employer/).fill('Two years in general practice; keen on endodontics.');
  await apply.getByRole('button', { name: 'Apply' }).click();
  await expect(apply.getByText(/^Agree to share your contact details with/)).toBeVisible({ timeout: 30_000 });
  await apply.getByLabel(/^Share my name, email and phone number/).check();
  await apply.getByRole('button', { name: 'Apply' }).click();
  await expect(apply.getByText(/^Applied\./)).toBeVisible({ timeout: 60_000 });
  expect(await seekerPage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const application = await prisma.jobApplication.findFirstOrThrow({ where: { postingId: state.postingId, applicantUserId: side.userId }, include: { resumeFile: true } });
  expect(application.resumeFile).toMatchObject({ purpose: 'RESUME', ownerUserId: side.userId });
});

test('the employer sees the application with the résumé and shortlists it; the applicant sees it', async () => {
  await employerPage.goto(`/account/organizations/${state.organizationId}/careers/${state.postingId}`);
  const item = employerPage.getByRole('listitem', { name: seeker.name });
  await expect(item).toBeVisible({ timeout: 120_000 });
  await expect(item.getByRole('link', { name: seeker.email })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Open résumé (cv.pdf)' })).toBeVisible();
  await item.getByRole('button', { name: 'Shortlist' }).click();
  await expect(item.getByText('Done. The applicant has been told.')).toBeVisible({ timeout: 60_000 });

  await seekerPage.goto('/account/applications');
  const mine = seekerPage.getByRole('list', { name: 'My applications' });
  await expect(mine.getByText('Shortlisted')).toBeVisible({ timeout: 120_000 });
});
