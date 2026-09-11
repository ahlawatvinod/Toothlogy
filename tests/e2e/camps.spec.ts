/**
 * TL-TEST-E2E-CAMPS-001 — a dental camp end to end in a real browser.
 *
 * Organizer plans a camp and submits it → staff approve it and it is listed
 * → a verified dentist applies and a patient registers (the page fits a
 * phone) → the organizer confirms the dentist and records the patient's
 * visit with a referral → the patient sees the referral under My camps.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the organizer is given the camp_organizer role and the staff
 * member platform_admin; the dentist gets a verified profile (verification
 * has its own tests); and once approved, the camp's start is moved into the
 * past so a visit can be recorded without waiting for the day. Passwords are
 * generated per run. Needs the development DATABASE_URL (from .env.local).
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
const person = (label: string) => ({ name: `E2E ${label} ${stamp}`, email: `e2e-camp-${label.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const organizer = person('Organizer');
const reviewer = person('Reviewer');
const dentist = person('Dentist');
const patient = person('Patient');
const title = `E2E Camp Tatibandh ${stamp}`;
const state = { campId: '', slug: '' };

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Tomorrow in India at hh:00, as a datetime-local value. */
const tomorrowAt = (hour: number) => `${new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T${String(hour).padStart(2, '0')}:00`;

async function register(browser: Browser, who: typeof organizer): Promise<{ page: Page; userId: string }> {
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

async function signIn(browser: Browser, who: typeof organizer): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

test('an organizer plans a camp and staff approve it', async ({ browser }) => {
  const { page, userId } = await register(browser, organizer);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'camp_organizer' } });

  await page.goto('/account/camps/new');
  await expect(page.getByRole('heading', { name: 'Organize a camp' })).toBeVisible({ timeout: 120_000 });
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/^District/).selectOption({ label: 'Raipur, Chhattisgarh' });
  await page.getByLabel(/^Venue\b/).first().fill('Govt. Higher Secondary School');
  await page.getByLabel(/^Venue address/).fill('Tatibandh, Raipur');
  await page.getByLabel(/^Starts/).fill(tomorrowAt(10));
  await page.getByLabel(/^Ends/).fill(tomorrowAt(14));
  await page.getByLabel(/^Places/).fill('40');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForURL(/\/account\/camps\/dcp_/, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText(/Submitted\. Toothlogy will review it/)).toBeVisible({ timeout: 60_000 });
  const camp = await prisma.camp.findFirstOrThrow({ where: { title } });
  state.campId = camp.id;
  state.slug = camp.slug;
  expect(camp.status).toBe('SUBMITTED');

  const staff = await register(browser, reviewer);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: staff.userId, roleKey: 'platform_admin' } });
  await staff.page.goto('/admin/camps');
  const card = staff.page.getByRole('region', { name: title });
  await expect(card).toBeVisible({ timeout: 120_000 });
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card.getByText('approved', { exact: true })).toBeVisible({ timeout: 60_000 });

  await staff.page.goto('/camps');
  await expect(staff.page.getByRole('link', { name: title })).toBeVisible({ timeout: 120_000 });
});

test('a verified dentist applies and a patient registers', async ({ browser }) => {
  const doc = await register(browser, dentist);
  await prisma.dentistProfile.create({ data: { id: id('dpr'), userId: doc.userId, slug: `e2e-camp-dentist-${stamp}`, languages: ['en'], isVerified: true, verifiedAt: new Date(), isDiscoverable: false } });
  await doc.page.goto(`/camps/${state.slug}`);
  await expect(doc.page.getByRole('heading', { name: title })).toBeVisible({ timeout: 120_000 });
  await doc.page.getByRole('button', { name: 'Apply to serve at this camp' }).click();
  await expect(doc.page.getByText('Application sent')).toBeVisible({ timeout: 60_000 });

  const pat = await register(browser, patient);
  await pat.page.goto(`/camps/${state.slug}`);
  await expect(pat.page.getByRole('heading', { name: title })).toBeVisible({ timeout: 120_000 });
  await pat.page.setViewportSize({ width: 375, height: 812 });
  expect(await pat.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await pat.page.getByLabel(/^Mobile number/).fill(`98270${String(Date.now()).slice(-5)}`);
  await pat.page.getByLabel(/^What would you like checked/).fill('Tooth pain on the left');
  await pat.page.getByRole('button', { name: 'Register' }).click();
  await expect(pat.page.getByText(/Agree to share your details/)).toBeVisible();
  await pat.page.getByRole('checkbox').check();
  await pat.page.getByRole('button', { name: 'Register' }).click();
  await expect(pat.page.getByText('You are registered')).toBeVisible({ timeout: 60_000 });
});

test('the organizer confirms the dentist, records the visit and the patient sees the referral', async ({ browser }) => {
  const page = await signIn(browser, organizer);
  await page.goto(`/account/camps/${state.campId}`);
  const doctorItem = page.getByRole('listitem').filter({ hasText: dentist.name });
  await expect(doctorItem).toBeVisible({ timeout: 120_000 });
  await doctorItem.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Confirmed. The dentist has been told.')).toBeVisible({ timeout: 60_000 });

  // Fixture: the camp day has come.
  await prisma.camp.update({ where: { id: state.campId }, data: { startsAt: new Date(Date.now() - 3_600_000) } });
  await page.reload();
  const patientItem = page.getByRole('list', { name: 'Patients' }).getByRole('listitem').filter({ hasText: patient.name });
  await expect(patientItem).toBeVisible({ timeout: 120_000 });
  await patientItem.getByRole('button', { name: 'Record visit' }).click();
  await patientItem.getByLabel('Findings').fill('Deep caries in 36; needs a filling');
  await patientItem.getByRole('checkbox', { name: 'Needs a follow-up visit' }).check();
  await patientItem.getByLabel('Refer to').selectOption({ label: dentist.name });
  await patientItem.getByRole('button', { name: 'Save visit' }).click();
  await expect(page.getByText('Visit recorded.')).toBeVisible({ timeout: 60_000 });

  const registration = await prisma.campRegistration.findFirstOrThrow({ where: { campId: state.campId }, include: { referredDentist: { select: { userId: true } } } });
  expect(registration).toMatchObject({ status: 'ATTENDED', needsFollowUp: true, source: 'SELF', consentToShare: true });
  expect(registration.referredDentist?.userId).toBe((await prisma.user.findUniqueOrThrow({ where: { email: dentist.email } })).id);

  const pat = await signIn(browser, patient);
  await pat.goto('/account/camps');
  await expect(pat.getByText(/Follow-up with/)).toBeVisible({ timeout: 120_000 });
  await expect(pat.getByText(dentist.name)).toBeVisible();
  await expect(pat.getByText(/The dentist noted: Deep caries in 36/)).toBeVisible();
});
