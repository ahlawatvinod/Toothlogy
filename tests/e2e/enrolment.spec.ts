/**
 * TL-TEST-E2E-ENROLMENT-001 — enrolment in a real browser.
 *
 * A college administrator enrols a student it admitted (academic year, roll
 * number), sees them on the Students roll, and marks the enrolment completed;
 * the student sees it under My admissions on a phone.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the college (organization, administrator membership), a published
 * BDS course and the student's admitted enquiry are created directly — the
 * admission flow before this point has its own specs.
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
const admin = { name: `Registrar ${stamp}`, email: `e2e-enrol-admin-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const student = { name: `Nisha Enrol${stamp}`, email: `e2e-enrol-student-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const roll = `BDS-${stamp.slice(-4).toUpperCase()}`;

test.afterAll(async () => {
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

test('a college enrols an admitted student and marks the enrolment completed; the student sees it', async ({ browser }) => {
  const registrar = await register(browser, admin);
  const learner = await register(browser, student);
  const organizationId = id('org');
  await prisma.organization.create({ data: { id: organizationId, type: 'COLLEGE', name: `E2E Enrol College ${stamp}`, slug: `e2e-enrol-college-${stamp}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: registrar.userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId: registrar.userId, organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: registrar.userId, roleKey: 'clinic_admin', organizationId } });
  const courseId = id('crs');
  await prisma.course.create({ data: { id: courseId, organizationId, level: 'BDS', name: 'Bachelor of Dental Surgery', slug: `bds-${stamp}`, durationMonths: 60, entranceExam: 'NEET_UG', status: 'PUBLISHED' } });
  await prisma.admissionEnquiry.create({ data: { id: id('enq'), organizationId, courseId, studentUserId: learner.userId, status: 'ADMITTED', consentToContact: true, decidedAt: new Date() } });

  const page = registrar.page;
  await page.goto(`/account/organizations/${organizationId}/admissions?status=ADMITTED`);
  const item = page.getByRole('list', { name: 'Admission enquiries' }).getByRole('listitem').filter({ hasText: student.name });
  await expect(item).toBeVisible({ timeout: 120_000 });
  await item.getByRole('button', { name: 'Enrol', exact: true }).click();
  await item.getByLabel('Academic year').fill('2026-27');
  await item.getByLabel('Roll number (optional)').fill(roll);
  await item.getByRole('button', { name: 'Enrol student' }).click();
  await expect(item.getByText(`Enrolled for 2026-27, roll ${roll}`)).toBeVisible({ timeout: 60_000 });

  await item.getByRole('link', { name: 'Students' }).click();
  await page.waitForURL(`**/organizations/${organizationId}/students`, { timeout: 120_000 });
  const row = page.getByRole('list', { name: 'Students' }).getByRole('listitem').filter({ hasText: student.name });
  await expect(row.getByText(`roll ${roll}`, { exact: false })).toBeVisible({ timeout: 60_000 });
  await row.getByRole('button', { name: 'Mark completed' }).click();
  await row.getByRole('button', { name: 'Save completion' }).click();
  await expect(row.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 });

  await learner.page.setViewportSize({ width: 375, height: 812 });
  await learner.page.goto('/account/admissions');
  const mine = learner.page.getByRole('list', { name: 'Enrolments' });
  await expect(mine.getByText('Bachelor of Dental Surgery at', { exact: false })).toBeVisible({ timeout: 120_000 });
  await expect(mine.getByText('Completed', { exact: true })).toBeVisible();
  expect(await learner.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const enrolment = await prisma.enrolment.findFirstOrThrow({ where: { studentUserId: learner.userId } });
  expect(enrolment).toMatchObject({ status: 'COMPLETED', academicYear: '2026-27', rollNumber: roll });
});
