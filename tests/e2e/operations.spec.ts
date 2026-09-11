/**
 * TL-TEST-E2E-OPERATIONS-001 — operations in a real browser.
 *
 * Staff: import a clinic, create its listing, open outreach for the district,
 * take the task, log a call, close it; the command centre fits a phone.
 * Practice: assign a lead to a colleague, log a connected call (the lead
 * becomes contacted), schedule a follow-up.
 *
 * Fixture steps, as direct database writes, because the flows that create
 * them are covered elsewhere and need providers or other accounts: new
 * accounts' emails are marked verified; the staff account is granted
 * platform_admin; the practice (organization, branch, membership, a
 * colleague, a patient and an accepted, free callback lead) is created for
 * the second account. Needs the development DATABASE_URL (from .env.local).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
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
const clinicName = `E2E Outreach Dental ${stamp}`;

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function registerAndSignIn(page: Page, label: string): Promise<string> {
  const email = `e2e-${label}-${stamp}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Your name').fill(`E2E ${label} ${stamp}`);
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(`e2e passphrase ${randomUUID()}`);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  return user.id;
}

test('staff open outreach for a district, then take, log and close a task', async ({ page }) => {
  const userId = await registerAndSignIn(page, 'ops');
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId, roleKey: 'platform_admin' } });

  // A listing to reach, through the data console.
  await page.goto('/admin/data');
  await expect(page.getByRole('heading', { name: 'Directory data (staff)' })).toBeVisible({ timeout: 120_000 });
  await page.getByLabel(/^Source/).fill(`E2E outreach survey ${stamp}`);
  await page.getByLabel('Rows are').selectOption('CLINIC');
  await page.getByLabel('…or paste CSV').first().fill(`Clinic Name,Phone,District,State\n"${clinicName}",9827${String(Date.now()).slice(-6)},Raipur,Chhattisgarh\n`);
  await page.getByRole('button', { name: 'Import rows' }).click();
  await expect(page.getByText(/1 rows: 1 new/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('row', { name: new RegExp(clinicName) }).getByRole('button', { name: 'Create unowned listing' }).click();
  await expect(page.getByRole('row', { name: new RegExp(clinicName) })).toHaveCount(0, { timeout: 60_000 });

  // The command centre, reached from the account navigation, fits a phone.
  await page.goto('/account');
  await page.getByRole('link', { name: 'Operations (staff)' }).click();
  await expect(page.getByRole('heading', { name: 'Operations (staff)' })).toBeVisible({ timeout: 120_000 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Exact: the page also has "Districts" and "Open outreach for a district" regions.
  await page.getByLabel('District', { exact: true }).selectOption({ label: 'Raipur, Chhattisgarh' });
  await page.getByLabel('Purpose', { exact: true }).selectOption('CLAIM_LISTING');
  await page.getByRole('button', { name: 'Open outreach' }).click();
  await expect(page.getByText(/tasks? opened\./)).toBeVisible({ timeout: 60_000 });

  // Unassigned: take it, log a call, close it.
  await page.goto('/admin/operations/tasks?scope=unassigned');
  const card = page.getByRole('region', { name: `Invite to claim: ${clinicName}` });
  await expect(card).toBeVisible({ timeout: 120_000 });
  await card.getByRole('button', { name: 'Take this task' }).click();
  await expect(page.getByText('The task is yours.')).toBeVisible({ timeout: 60_000 });

  await page.goto('/admin/operations/tasks?scope=mine');
  const mine = page.getByRole('region', { name: `Invite to claim: ${clinicName}` });
  await mine.getByRole('button', { name: 'Log activity' }).click();
  await mine.getByLabel('Outcome').selectOption('NO_ANSWER');
  await mine.getByLabel('Note').fill('Rang twice');
  await mine.getByRole('button', { name: 'Save' }).click();
  await expect(mine.getByText(/call — no answer: Rang twice/)).toBeVisible({ timeout: 60_000 });

  await mine.getByRole('button', { name: 'Close task' }).click();
  await mine.getByLabel('Outcome').selectOption('INTERESTED');
  await mine.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByRole('region', { name: `Invite to claim: ${clinicName}` })).toHaveCount(0, { timeout: 60_000 });

  const task = await prisma.outreachTask.findFirstOrThrow({ where: { title: `Invite to claim: ${clinicName}` }, include: { activities: true } });
  expect(task).toMatchObject({ status: 'DONE', outcome: 'INTERESTED', assignedToUserId: userId, openKey: null });
  expect(task.activities.map((a) => a.type).sort()).toEqual(['CALL', 'NOTE']);
});

test('a practice assigns a lead, logs a connected call and schedules the follow-up', async ({ page }) => {
  const ownerId = await registerAndSignIn(page, 'practice');
  const organizationId = id('org');
  const colleagueId = id('usr');
  const patientId = id('usr');
  const leadId = id('lead');
  await prisma.organization.create({ data: { id: organizationId, type: 'CLINIC', name: `E2E Work Clinic ${stamp}`, slug: `e2e-work-${stamp}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING', ownerUserId: ownerId } });
  const locationId = id('loc');
  await prisma.location.create({ data: { id: locationId, organizationId, name: 'Main', slug: 'main', timezone: 'Asia/Kolkata', isPrimary: true } });
  for (const [uid, name] of [
    [colleagueId, `E2E Colleague ${stamp}`],
    [patientId, `E2E Lead Patient ${stamp}`],
  ] as const) {
    await prisma.user.create({ data: { id: uid, email: `${uid}@example.test`, phone: null, displayName: name, status: 'ACTIVE', locale: 'en-IN', countryCode: 'IN', timezone: 'Asia/Kolkata' } });
  }
  await prisma.organizationMember.create({ data: { id: id('om'), userId: ownerId, organizationId, roleKey: 'clinic_admin', isPrimary: true } });
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: ownerId, roleKey: 'clinic_admin', organizationId } });
  await prisma.organizationMember.create({ data: { id: id('om'), userId: colleagueId, organizationId, roleKey: 'clinic_staff' } });
  await prisma.lead.create({
    data: { id: leadId, patientUserId: patientId, organizationId, locationId, source: 'CALLBACK_REQUEST', status: 'ACCEPTED', billingStatus: 'FREE', dedupeKey: leadId, deliveredAt: new Date(), acceptedAt: new Date() },
  });

  await page.goto('/account/practice/leads');
  const item = page.getByRole('listitem').filter({ hasText: `E2E Lead Patient ${stamp}` });
  await expect(item).toBeVisible({ timeout: 120_000 });

  await item.getByLabel('Working this lead').selectOption({ label: `E2E Colleague ${stamp}` });
  await expect(item.getByText(`With E2E Colleague ${stamp}`)).toBeVisible({ timeout: 60_000 });

  await item.getByRole('button', { name: 'Log a call' }).click();
  await item.getByLabel('How did it go?').selectOption('CONNECTED');
  await item.getByLabel('Note (optional)').fill('Wants a cleaning on Saturday');
  await item.getByRole('button', { name: 'Save call' }).click();
  await expect(item.getByText('contacted', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(item.getByText(/Call — connected: Wants a cleaning on Saturday/)).toBeVisible();

  const tomorrow = new Date(Date.now() + 86_400_000);
  const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await item.getByRole('button', { name: 'Schedule follow-up' }).click();
  await item.getByLabel('Follow up on').fill(local);
  await item.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(item.getByText(/follow up /)).toBeVisible({ timeout: 60_000 });

  const saved = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, include: { events: { orderBy: { createdAt: 'asc' } } } });
  expect(saved).toMatchObject({ status: 'CONTACTED', assignedToUserId: colleagueId });
  expect(saved.nextFollowUpAt).not.toBeNull();
  expect(saved.events.map((e) => e.action)).toEqual(['ASSIGNED', 'CALL_LOGGED', 'FOLLOW_UP_SET']);
});
