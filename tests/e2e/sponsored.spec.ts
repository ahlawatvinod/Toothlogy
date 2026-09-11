/**
 * TL-TEST-E2E-SPONSORED-001 — Prime / Sponsored in a real browser.
 *
 * Practice → wallet → campaign → target → activate → /find → Sponsored result
 * → click → profile → booking → lead → billing; then an over-budget
 * activation refused, pausing removes the slot, organic results unaffected,
 * and cancelling refunds the unspent budget once.
 *
 * The practice and the way in come from helpers/practice-access.ts, as in
 * patient-and-practice.spec.ts (E2E_PRACTICE_* when set, otherwise a
 * development practice and a test-created administrator removed afterwards).
 * Direct database writes: the new patient's email is marked verified (no email
 * provider is connected), and, if the practice wallet holds less than ₹250, a
 * labelled fixture top-up (E2E-FIXTURE-TOPUP) — the staff console's step.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { ensureWallet, practiceAccess, type PracticeAccess } from './helpers/practice-access';

function envLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '');
}

let access: PracticeAccess | null = null;
const prisma = new PrismaClient({ datasources: { db: { url: envLocal('DATABASE_URL') } } });

const stamp = Date.now().toString(36);
const patient = { name: `E2E Prime Patient ${stamp}`, email: `e2e-prime-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const state = { organizationId: '', dentistName: '', dentistSlug: '', campaignId: '', walletBefore: BigInt(0) };

const istDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  access = await practiceAccess(prisma, browser, 'sponsored');
  test.skip(!access, 'No development practice offers video; set E2E_PRACTICE_ID.');
  const practice = await prisma.dentistPractice.findUniqueOrThrow({
    where: { id: access!.practiceId },
    select: { location: { select: { organizationId: true } }, dentistProfile: { select: { slug: true, user: { select: { displayName: true } } } } },
  });
  state.organizationId = practice.location.organizationId;
  state.dentistName = practice.dentistProfile.user.displayName ?? '';
  state.dentistSlug = practice.dentistProfile.slug;
  // No other open campaign for this practice may clash with the one created here.
  const open = await prisma.sponsoredCampaign.count({ where: { practiceId: access!.practiceId, status: { in: ['DRAFT', 'ACTIVE', 'PAUSED'] } } });
  expect(open, 'close earlier E2E campaigns for this practice first').toBe(0);
  state.walletBefore = await ensureWallet(prisma, state.organizationId, BigInt(25_000));
});

test.afterAll(async () => {
  await access?.cleanup();
  await prisma.$disconnect();
});

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');
}

async function ownerPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, access!.identifier, access!.password);
  return page;
}

test('practice creates, targets and activates a Prime campaign from its wallet', async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto(`/account/organizations/${state.organizationId}/campaigns`);
  await expect(page.getByRole('heading', { name: 'Prime campaigns' })).toBeVisible();

  await page.getByLabel('Campaign name').fill(`E2E Prime ${stamp}`);
  await page.getByLabel(new RegExp(`Prime dentist: ${state.dentistName}`)).check();
  await page.getByLabel('Starts').fill(istDate(0));
  await page.getByLabel('Ends (last day)').fill(istDate(1));
  await page.getByLabel(/^Total budget/).fill('250');
  await page.getByLabel('Clinic visits').check(); // appointment-type targeting
  // The preview is labelled exactly as the live result will be.
  await expect(page.getByRole('region', { name: `Sponsored: ${state.dentistName}` }).getByText('Sponsored', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/\/campaigns\/cmp_/);
  state.campaignId = page.url().split('/').pop()!;

  await page.getByRole('button', { name: /^Activate/ }).click();
  await expect(page.getByText(/Active\. The budget is held from your wallet/)).toBeVisible();
  const campaign = await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: state.campaignId } });
  expect([campaign.status, campaign.heldMinor, campaign.targetAppointmentTypes]).toEqual(['ACTIVE', BigInt(25_000), ['CLINIC']]);
  const holds = await prisma.ledgerEntry.findMany({ where: { campaignId: state.campaignId, kind: 'SPONSORED_HOLD' } });
  expect(holds.map((h) => h.amountMinor)).toEqual([BigInt(-25_000)]);
  expect((await prisma.wallet.findUniqueOrThrow({ where: { organizationId: state.organizationId } })).balanceMinor).toBe(state.walletBefore - BigInt(25_000));

  // A second campaign the wallet cannot cover is refused at activation, and nothing moves.
  await page.goto(`/account/organizations/${state.organizationId}/campaigns`);
  await page.getByLabel('Campaign name').fill(`E2E Prime too big ${stamp}`);
  await page.getByLabel(new RegExp(`Prime dentist: ${state.dentistName}`)).check();
  await page.getByLabel('Sponsored slot above search results').uncheck();
  await page.getByLabel(/Sponsored slot on other dentists/).check();
  await page.getByLabel(/^Total budget/).fill('100000');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/\/campaigns\/cmp_/);
  const bigId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: /^Activate/ }).click();
  await expect(page.getByText(/Recharge first/)).toBeVisible();
  expect((await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: bigId } })).status).toBe('DRAFT');
  expect(await prisma.ledgerEntry.count({ where: { campaignId: bigId } })).toBe(0);
  await page.getByRole('button', { name: 'Cancel campaign' }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect.poll(async () => (await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: bigId } })).status).toBe('CANCELLED');
});

test('patient sees the Sponsored result, clicks through, books; the lead is attributed and billed; pause hides it', async ({ page, browser }) => {
  // A new patient, registered through the real form.
  await page.goto('/register');
  await page.getByLabel('Your name').fill(patient.name);
  await page.getByLabel('Email address').fill(patient.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(patient.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account');
  await prisma.user.update({ where: { email: patient.email }, data: { emailVerifiedAt: new Date() } });

  await page.goto('/find?type=dentist');
  const sponsored = page.getByRole('region', { name: 'Sponsored' });
  await expect(sponsored.getByText('Sponsored', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await expect(sponsored.getByText(state.dentistName)).toBeVisible();
  // Organic results are a separate section, with no paid label in them.
  const organic = page.getByRole('region', { name: 'Results' });
  await expect(organic.getByRole('link', { name: state.dentistName }).first()).toBeVisible();
  await expect(organic.getByText('Sponsored', { exact: true })).toHaveCount(0);

  await sponsored.getByRole('link', { name: 'View and book' }).first().click();
  await page.waitForURL(new RegExp(`/dentists/${state.dentistSlug}\\?sp=`));
  await page.getByRole('link', { name: 'Book', exact: true }).first().click();
  await page.waitForURL(/\/book\/.*sp=/);
  await page.getByLabel(/^Consultation —/).check();
  const times = page.getByRole('group', { name: /(Morning|Afternoon|Evening) times/ }).getByRole('button');
  await expect(times.first()).toBeVisible({ timeout: 120_000 });
  await times.first().click();
  await page.getByRole('button', { name: /^(Send request|Book)$/ }).click();
  await expect(page.getByText(/Request sent|Booked and confirmed/)).toBeVisible();
  await page.getByRole('link', { name: 'View your appointment' }).click();
  await page.waitForURL(/\/account\/appointments\/apt_/);
  const appointmentId = page.url().split('/').pop()!;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { appointmentId } });
  expect(lead.campaignId).toBe(state.campaignId);
  const events = await prisma.sponsoredEvent.groupBy({ by: ['kind'], where: { campaignId: state.campaignId, excluded: false }, _count: true });
  const count = (k: string) => events.find((e) => e.kind === k)?._count ?? 0;
  expect([count('CLICK'), count('PROFILE_VIEW'), count('BOOK_CLICK')]).toEqual([1, 1, 1]);
  expect(count('IMPRESSION')).toBeGreaterThanOrEqual(1);

  // The practice confirms: the lead qualifies and is billed by the tiered rule (not by the campaign).
  const owner = await ownerPage(browser);
  await owner.goto(`/account/practice/appointments/${appointmentId}`);
  await owner.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(async () => (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).billingStatus).not.toBe('NOT_BILLABLE');
  const billed = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  expect(['FREE', 'CHARGED']).toContain(billed.billingStatus);
  expect(await prisma.ledgerEntry.count({ where: { leadId: lead.id, kind: 'LEAD_CHARGE' } })).toBe(billed.billingStatus === 'CHARGED' ? 1 : 0);

  // The campaign page shows the attributed lead and the spend.
  await owner.goto(`/account/organizations/${state.organizationId}/campaigns/${state.campaignId}`);
  await expect(owner.getByRole('row', { name: /^Leads/ })).toContainText('1');

  // Paused: the Sponsored slot disappears from /find.
  await owner.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: state.campaignId } })).status).toBe('PAUSED');
  await page.goto('/find?type=dentist');
  await expect(page.getByRole('region', { name: 'Results' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sponsored' })).toHaveCount(0);

  // Cancelled: the unspent budget comes back, once.
  await owner.reload();
  await owner.getByRole('button', { name: 'Cancel campaign' }).click();
  await owner.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect.poll(async () => (await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: state.campaignId } })).status).toBe('CANCELLED');
  const closed = await prisma.sponsoredCampaign.findUniqueOrThrow({ where: { id: state.campaignId } });
  const refunds = await prisma.ledgerEntry.findMany({ where: { campaignId: state.campaignId, kind: 'SPONSORED_REFUND' } });
  expect(refunds.map((r) => r.amountMinor)).toEqual([closed.heldMinor - closed.spentMinor]);
  expect(closed.spentMinor + closed.refundedMinor).toBe(closed.heldMinor);
});
