/**
 * TL-TEST-E2E-TREATMENT-PLANS-001 — a treatment plan in a real browser.
 *
 * A clinician proposes a two-treatment plan on the patient's record page; the
 * patient accepts it on their own record; the clinician records one treatment
 * done and one not done (with a reason), and the plan completes for both.
 *
 * Fixtures written directly: the clinic, the clinician's membership, and an
 * active read-and-add grant (sharing has its own browser test in
 * records.spec.ts); verified emails (no email provider is connected).
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
const title = `Restore the upper right ${stamp}`;
const state = { organizationId: '', patientId: '', clinician: null as Page | null, patient: null as Page | null };

test.describe.configure({ mode: 'serial' });
test.afterAll(async () => {
  await prisma.$disconnect();
});

async function register(browser: Browser, label: string): Promise<{ page: Page; userId: string }> {
  const email = `e2e-tp-${label}-${stamp}@example.test`;
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

const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('a clinician proposes a plan on the patient’s record', async ({ browser }) => {
  const clinician = await register(browser, 'clinician');
  const patient = await register(browser, 'patient');
  state.organizationId = id('org');
  state.patientId = patient.userId;
  state.clinician = clinician.page;
  state.patient = patient.page;
  await prisma.organization.create({ data: { id: state.organizationId, type: 'CLINIC', name: `E2E Plan Clinic ${stamp}`, slug: `e2e-plan-clinic-${stamp}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: clinician.userId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId: clinician.userId, organizationId: state.organizationId, roleKey: 'clinician', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: clinician.userId, roleKey: 'clinician', organizationId: state.organizationId } });
  // As sharing does it: an active grant always carries the patient's consent (the database insists).
  const consentId = id('cns');
  await prisma.consent.create({ data: { id: consentId, userId: patient.userId, purpose: 'CLINICAL_DATA_SHARING', policyVersion: 'clinical-data-sharing/2026-09' } });
  await prisma.recordAccessGrant.create({ data: { id: id('rag'), patientUserId: patient.userId, organizationId: state.organizationId, status: 'ACTIVE', canWrite: true, grantedAt: new Date(), consentId, openKey: `${patient.userId}:${state.organizationId}` } });

  const page = clinician.page;
  await page.goto(`/account/organizations/${state.organizationId}/patients/${patient.userId}`, { timeout: 120_000 });
  const plans = page.getByRole('region', { name: 'Treatment plans', exact: true });
  await expect(plans).toBeVisible({ timeout: 120_000 });
  await plans.getByLabel(/^Plan title/).fill(title);
  await plans.getByLabel(/^Notes for the patient/).fill('Two visits, a week apart.');
  const first = plans.getByRole('group', { name: 'Treatment 1' });
  await first.getByLabel(/^What/).fill('Root canal treatment');
  await first.getByLabel(/^Teeth/).fill('16');
  await first.getByLabel(/^Estimate/).fill('6500');
  await plans.getByRole('button', { name: 'Add a treatment' }).click();
  const second = plans.getByRole('group', { name: 'Treatment 2' });
  await second.getByLabel(/^What/).fill('Crown');
  await second.getByLabel(/^Teeth/).fill('16');
  await second.getByLabel(/^Estimate/).fill('8000.50');
  await plans.getByRole('button', { name: 'Propose plan' }).click();
  await expect(plans.getByText(/^Proposed\./)).toBeVisible({ timeout: 60_000 });

  const saved = await prisma.treatmentPlan.findFirstOrThrow({ where: { patientUserId: patient.userId, title }, include: { items: true } });
  expect([saved.status, saved.estimateMinor, saved.items.length]).toEqual(['PROPOSED', BigInt(1_450_050), 2]);
  await expect(plans.getByRole('region', { name: `Treatment plan: ${title}` }).getByText('Waiting for the patient')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noOverflow(page)).toBe(true);
});

test('the patient accepts it on their own record', async () => {
  const page = state.patient!;
  await page.goto('/account/records', { timeout: 120_000 });
  const plan = page.getByRole('region', { name: `Treatment plan: ${title}` });
  await expect(plan.getByText('Waiting for your decision')).toBeVisible({ timeout: 120_000 });
  await expect(plan.getByText(/₹14,500\.50 including tax/)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noOverflow(page)).toBe(true);
  await plan.getByRole('button', { name: 'Accept plan' }).click();
  await expect(plan.getByText('Accepted', { exact: true })).toBeVisible({ timeout: 60_000 });
  expect((await prisma.treatmentPlan.findFirstOrThrow({ where: { title } })).status).toBe('ACCEPTED');
});

test('the clinician records the treatments; the plan completes for both', async () => {
  const page = state.clinician!;
  await page.goto(`/account/organizations/${state.organizationId}/patients/${state.patientId}`, { timeout: 120_000 });
  const plan = page.getByRole('region', { name: `Treatment plan: ${title}` });
  await plan.getByRole('group', { name: 'Progress on Root canal treatment' }).getByRole('button', { name: 'Mark done' }).click();
  await expect(plan.getByText(/Root canal treatment .* Done/)).toBeVisible({ timeout: 60_000 });
  const crown = plan.getByRole('group', { name: 'Progress on Crown' });
  await crown.getByRole('button', { name: 'Not done' }).click();
  await crown.getByLabel(/^Why it was not done/).fill('Patient chose a bridge elsewhere.');
  await crown.getByRole('button', { name: 'Record as not done' }).click();
  await expect(plan.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 });
  expect((await prisma.treatmentPlan.findFirstOrThrow({ where: { title } })).status).toBe('COMPLETED');

  const mine = state.patient!;
  await mine.goto('/account/records');
  const patientView = mine.getByRole('region', { name: `Treatment plan: ${title}` });
  await expect(patientView.getByText('Completed', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(patientView.getByText(/Not done: Patient chose a bridge elsewhere\./)).toBeVisible();
});
