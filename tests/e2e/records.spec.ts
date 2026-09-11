/**
 * TL-TEST-E2E-RECORDS-001 — the dental record and prescriptions in a real browser.
 *
 * A patient adds to their own record and shares it (read and add) with a
 * practice they have an appointment with. A verified dentist at the practice
 * finds them under Patients' records, reads the record, adds an X-ray (a real
 * upload through the file service) and issues a prescription; the printable
 * prescription shows its QR code and fits a phone. A pharmacist, signed out,
 * checks the code. The patient sees who looked, then withdraws access — and
 * the practice's page is gone.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the patient's appointment is recorded (on a day of its own); the
 * dentist's profile is recorded as verified (verification has its own specs)
 * and they are made a clinician of the E2E practice's organization, removed
 * afterwards.
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
const id = (prefix: string) => `${prefix}_e2e_${stamp}_${Math.random().toString(36).slice(2, 7)}`;
const person = (first: string) => ({ name: `${first} Record${stamp}`, email: `e2e-rec-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const patient = person('Kavya');
const clinician = person('Doctor');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(7)]);
const state = { organizationId: '', organizationName: '', membershipId: '', patientUserId: '', verifyCode: '' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { location: { select: { organizationId: true, organization: { select: { name: true } } } } } });
  test.skip(!practice, 'Needs the development E2E practice.');
  state.organizationId = practice!.location.organizationId;
  state.organizationName = practice!.location.organization.name;
});

test.afterAll(async () => {
  if (state.membershipId) {
    await prisma.organizationMember.deleteMany({ where: { id: state.membershipId } });
    await prisma.roleAssignment.deleteMany({ where: { id: state.membershipId.replace('om_', 'ra_') } });
  }
  await prisma.$disconnect();
});

async function register(browser: Browser, who: typeof patient): Promise<{ page: Page; userId: string }> {
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

/** Elements sticking out past the viewport's right edge — empty when the page fits. */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const box = el.getBoundingClientRect();
      if (box.width > 0 && box.right > width + 1 && !el.closest('[style*="overflow"], .tl-rx__scroll')) {
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''} → ${Math.round(box.right)}px`);
      }
      if (out.length >= 8) break;
    }
    if (document.documentElement.scrollWidth > width && out.length === 0) out.push(`document ${document.documentElement.scrollWidth}px > ${width}px`);
    return out;
  });
}

let patientPage: Page;
let doctorPage: Page;

test('a patient adds to their record and shares it with their practice', async ({ browser }) => {
  const side = await register(browser, patient);
  patientPage = side.page;
  state.patientUserId = side.userId;
  const practice = await prisma.dentistPractice.findUniqueOrThrow({ where: { id: PRACTICE_ID }, select: { dentistProfileId: true, locationId: true, location: { select: { organizationId: true, timezone: true } } } });
  const startsAt = new Date(Date.now() + (40 + Math.floor(Math.random() * 400)) * 24 * 3_600_000);
  await prisma.appointment.create({
    data: { id: id('apt'), patientUserId: side.userId, practiceId: PRACTICE_ID, dentistProfileId: practice.dentistProfileId, locationId: practice.locationId, organizationId: practice.location.organizationId, serviceName: 'Check-up', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), occupiedUntil: new Date(startsAt.getTime() + 30 * 60_000), timezone: practice.location.timezone, mode: 'INSTANT', status: 'CONFIRMED', usesChair: false, confirmedAt: new Date() },
  });

  await patientPage.goto('/account/records');
  const add = patientPage.getByRole('region', { name: 'Add to your record' });
  await expect(add).toBeVisible({ timeout: 120_000 });
  await add.getByLabel('Title').fill('Root canal, upper left');
  await add.getByLabel('Teeth (optional)').fill('26, 16');
  await add.getByLabel('Notes', { exact: true }).fill('Done in 2023 at my old clinic.');
  await add.getByRole('button', { name: 'Add to record' }).click();
  await expect(add.getByText('Added to the record.')).toBeVisible({ timeout: 60_000 });
  await expect(patientPage.getByRole('list', { name: 'Record entries' }).getByText('teeth 16, 26')).toBeVisible();

  const who = patientPage.getByRole('region', { name: 'Who can see your record' });
  await expect(who.getByText('Nobody but you.')).toBeVisible();
  await who.getByLabel('Practice').selectOption({ label: state.organizationName });
  await who.getByLabel(/^Also let them add to it/).check();
  await who.getByRole('button', { name: 'Share my record' }).click();
  await expect(who.getByRole('list', { name: 'Practices with access' }).getByText(state.organizationName)).toBeVisible({ timeout: 60_000 });
  const grant = await prisma.recordAccessGrant.findFirstOrThrow({ where: { patientUserId: side.userId, organizationId: state.organizationId }, include: { consent: true } });
  expect(grant).toMatchObject({ status: 'ACTIVE', canWrite: true });
  expect(grant.consent?.purpose).toBe('CLINICAL_DATA_SHARING');
});

test('a verified dentist reads it, adds an X-ray, prescribes; the pharmacist checks the QR code', async ({ browser }) => {
  const side = await register(browser, clinician);
  doctorPage = side.page;
  await prisma.dentistProfile.create({ data: { id: id('prf'), userId: side.userId, slug: `e2e-rec-${stamp}`, languages: ['en'], status: 'VERIFIED', isVerified: true, verifiedAt: new Date() } });
  state.membershipId = id('om');
  await prisma.organizationMember.create({ data: { id: state.membershipId, userId: side.userId, organizationId: state.organizationId, roleKey: 'clinician' } });
  await prisma.roleAssignment.create({ data: { id: state.membershipId.replace('om_', 'ra_'), userId: side.userId, roleKey: 'clinician', organizationId: state.organizationId } });

  await doctorPage.goto(`/account/organizations/${state.organizationId}/patients`);
  const shared = doctorPage.getByRole('region', { name: 'Shared with you' });
  await expect(shared).toBeVisible({ timeout: 120_000 });
  await shared.getByRole('link', { name: patient.name }).click();
  await doctorPage.waitForURL(`**/patients/${state.patientUserId}`, { timeout: 120_000 });
  await expect(doctorPage.getByRole('list', { name: 'Record entries' }).getByText('Root canal, upper left')).toBeVisible({ timeout: 60_000 });

  const add = doctorPage.getByRole('region', { name: 'Add to the record' });
  await add.getByLabel('What it is').selectOption({ label: 'X-ray or scan' });
  await add.getByLabel('Title').fill('Bitewing, right side');
  await add.getByLabel('File', { exact: true }).setInputFiles({ name: 'bitewing.png', mimeType: 'image/png', buffer: PNG });
  await add.getByRole('button', { name: 'Add to record' }).click();
  await expect(add.getByText('Added to the record.')).toBeVisible({ timeout: 60_000 });
  const entries = doctorPage.getByRole('list', { name: 'Record entries' });
  await expect(entries.getByRole('button', { name: 'Open bitewing.png' })).toBeVisible({ timeout: 60_000 });
  const xray = await prisma.recordEntry.findFirstOrThrow({ where: { patientUserId: state.patientUserId, title: 'Bitewing, right side' }, include: { file: true } });
  expect(xray.file).toMatchObject({ ownerUserId: state.patientUserId, purpose: 'XRAY', sensitivity: 'PHI' });

  const rx = doctorPage.getByRole('region', { name: 'Prescribe' });
  const first = rx.getByRole('listitem', { name: 'Medicine 1' });
  await first.getByLabel('Medicine', { exact: true }).fill('Amoxicillin');
  await first.getByLabel('Strength').fill('500 mg');
  await first.getByLabel('Dose').fill('1 capsule');
  await first.getByLabel('How often').fill('Three times a day');
  await first.getByLabel('For how long').fill('5 days');
  await rx.getByRole('button', { name: 'Issue prescription' }).click();
  await doctorPage.waitForURL(/\/prescriptions\/rx_/, { timeout: 120_000 });
  await doctorPage.setViewportSize({ width: 375, height: 812 });
  const article = doctorPage.getByRole('article', { name: 'Prescription' });
  await expect(article.getByRole('cell', { name: /Amoxicillin/ })).toBeVisible({ timeout: 60_000 });
  await expect(article.getByRole('img', { name: 'QR code to check this prescription' }).locator('svg')).toBeVisible();
  expect(await overflowing(doctorPage)).toEqual([]);

  const issued = await prisma.prescription.findFirstOrThrow({ where: { patientUserId: state.patientUserId } });
  state.verifyCode = issued.verifyCode;
  const pharmacist = await (await browser.newContext()).newPage();
  await pharmacist.goto(`/rx/${issued.verifyCode}`);
  await expect(pharmacist.getByText(/^Genuine — issued on Toothlogy/)).toBeVisible({ timeout: 120_000 });
  await expect(pharmacist.getByRole('list', { name: 'Medicines' }).getByText(/Amoxicillin 500 mg/)).toBeVisible();
  await expect(pharmacist.getByText(`Kavya R.`)).toBeVisible();
  expect((await pharmacist.goto('/rx/AAAAAAAAAAAAAAAA'))?.status()).toBe(404);
});

test('the patient sees who looked, withdraws access, and the practice’s view is gone', async () => {
  await patientPage.setViewportSize({ width: 1280, height: 900 });
  await patientPage.goto('/account/records');
  const looked = patientPage.getByRole('list', { name: 'Who looked' });
  await expect(looked.getByText(clinician.name).first()).toBeVisible({ timeout: 120_000 });
  await expect(patientPage.getByRole('list', { name: 'Prescriptions' }).getByText(state.organizationName)).toBeVisible();
  await expect(patientPage.getByRole('list', { name: 'Record entries' }).getByText('Bitewing, right side')).toBeVisible();

  const who = patientPage.getByRole('region', { name: 'Who can see your record' });
  await who.getByRole('button', { name: 'Withdraw access' }).click();
  await who.getByRole('button', { name: /^Yes, withdraw/ }).click();
  await expect(who.getByText('Nobody but you.')).toBeVisible({ timeout: 60_000 });

  const gone = await doctorPage.goto(`/account/organizations/${state.organizationId}/patients/${state.patientUserId}`);
  expect(gone?.status()).toBe(404);
  const grant = await prisma.recordAccessGrant.findFirstOrThrow({ where: { patientUserId: state.patientUserId, organizationId: state.organizationId }, include: { consent: true } });
  expect(grant.status).toBe('REVOKED');
  expect(grant.consent?.revokedAt).not.toBeNull();
});
