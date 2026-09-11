/**
 * TL-TEST-E2E-EDUCATION-001 — colleges and admissions in a real browser.
 *
 * College: the administrator fills in the academic profile, adds a BDS
 * course, publishes it and opens an admission window; the public page shows
 * it. Student: finds the college, sends an enquiry with consent, sees it
 * under My admissions; the college page fits a phone. College again: marks
 * the enquiry contacted, and the student is told.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified (no email provider is connected), and the college (organization,
 * branch in Raipur, administrator membership) is created for the first
 * account — claiming is covered by its own tests. Passwords are generated
 * per run. Needs the development DATABASE_URL (from .env.local).
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
const collegeName = `E2E Dental College ${stamp}`;
const collegeSlug = `e2e-dental-college-${stamp}`;
const admin = { email: `e2e-college-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}`, name: `E2E College Admin ${stamp}` };
const student = { email: `e2e-student-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}`, name: `E2E Student ${stamp}` };
const state = { organizationId: '', studentId: '' };

const istDate = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(page: Page, who: typeof admin): Promise<string> {
  await page.goto('/register');
  await page.getByLabel('Your name').fill(who.name);
  await page.getByLabel('Email address').fill(who.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(who.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  return (await prisma.user.update({ where: { email: who.email }, data: { emailVerifiedAt: new Date() } })).id;
}

async function signIn(browser: Browser, who: typeof admin): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
  return page;
}

test('a college publishes a BDS course with its admission window', async ({ page }) => {
  const ownerId = await register(page, admin);
  const raipur = await prisma.district.findFirstOrThrow({ where: { slug: 'raipur', region: { name: 'Chhattisgarh' } } });
  state.organizationId = id('org');
  await prisma.organization.create({ data: { id: state.organizationId, type: 'COLLEGE', name: collegeName, slug: collegeSlug, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: ownerId } });
  await prisma.location.create({ data: { id: id('loc'), organizationId: state.organizationId, name: 'Campus', slug: 'campus', timezone: 'Asia/Kolkata', isPrimary: true, districtId: raipur.id } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId: ownerId, organizationId: state.organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: ownerId, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await page.goto(`/account/organizations/${state.organizationId}`);
  await page.getByRole('region', { name: 'College' }).getByRole('link', { name: 'Courses' }).click();
  await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible({ timeout: 120_000 });

  await page.getByLabel('Ownership').selectOption('GOVERNMENT');
  await page.getByLabel('Affiliated university').fill('Pt. Ravishankar Shukla University');
  await page.getByLabel(/^Recognised by/).fill('Dental Council of India');
  await page.getByLabel(/^Recognition reference/).fill('DE-4(12)/2003');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText(/Saved\. Toothlogy staff check stated recognition/)).toBeVisible({ timeout: 60_000 });

  await page.getByLabel('Seats (optional)').fill('100');
  await page.getByLabel(/^Fee per year, INR/).fill('450000');
  await page.getByRole('button', { name: 'Add course' }).click();
  await expect(page.getByText('Added as a draft. Publish it when the details are right.')).toBeVisible({ timeout: 60_000 });

  const course = page.getByRole('list', { name: 'Courses' }).getByRole('listitem').filter({ hasText: 'Bachelor of Dental Surgery' });
  await course.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Published: students can see it and enquire.')).toBeVisible({ timeout: 60_000 });
  await course.getByRole('button', { name: 'Admission window', exact: true }).click();
  await course.getByLabel('Opens').fill(istDate(-5));
  await course.getByLabel('Closes').fill(istDate(30));
  await course.getByRole('button', { name: 'Save window' }).click();
  await expect(page.getByText(/Admission window for \d{4}-\d{2} saved\./)).toBeVisible({ timeout: 60_000 });

  const saved = await prisma.course.findFirstOrThrow({ where: { organizationId: state.organizationId }, include: { cycles: true } });
  expect(saved).toMatchObject({ level: 'BDS', status: 'PUBLISHED', seats: 100, annualFeeMinor: BigInt(45_000_000), entranceExam: 'NEET_UG' });
  expect(saved.cycles).toHaveLength(1);
});

test('a student finds the college and enquires about the course', async ({ page }) => {
  state.studentId = await register(page, student);
  await page.goto('/colleges?level=BDS');
  await page.getByRole('link', { name: collegeName }).click();
  await expect(page.getByRole('heading', { name: collegeName })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('As stated by the college; not checked by Toothlogy.')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Bachelor of Dental Surgery/ })).toBeVisible();
  await expect(page.getByText(/: open until /)).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByLabel(/^Your qualification/).fill('Class XII (PCB), 2026');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText(/Agree to be contacted by/)).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText('Enquiry sent')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('link', { name: 'My admissions' }).click();
  const mine = page.getByRole('region', { name: `Bachelor of Dental Surgery at ${collegeName}` });
  await expect(mine).toBeVisible({ timeout: 120_000 });
  await expect(mine.getByText('New', { exact: true })).toBeVisible();
});

test('the college marks the enquiry contacted and the student is told', async ({ browser }) => {
  const page = await signIn(browser, admin);
  await page.goto(`/account/organizations/${state.organizationId}/admissions`);
  const item = page.getByRole('listitem').filter({ hasText: student.name });
  await expect(item).toBeVisible({ timeout: 120_000 });
  await expect(item.getByText(/Student says: Class XII \(PCB\), 2026/)).toBeVisible();
  await item.getByRole('button', { name: 'Mark contacted' }).click();
  await expect(page.getByText('Updated. The student has been told.')).toBeVisible({ timeout: 60_000 });

  const enquiry = await prisma.admissionEnquiry.findFirstOrThrow({ where: { studentUserId: state.studentId } });
  expect(enquiry).toMatchObject({ status: 'CONTACTED', consentToContact: true });
  expect(await prisma.inAppNotification.count({ where: { userId: state.studentId, notificationId: 'TL-NOTIF-ADMISSION-UPDATE-001' } })).toBe(1);
});
