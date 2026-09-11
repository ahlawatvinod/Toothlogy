/**
 * TL-TEST-E2E-REVIEWS-001 — reviews in a real browser.
 *
 * A patient rates a visit that took place; the review appears on the
 * dentist's public page under a first name and initial (the page fits a
 * phone). The practice replies; then flags it; a moderator hides it and it
 * leaves the public page.
 *
 * Runs against the development E2E practice (E2E_PRACTICE_ID, default the
 * one the booking specs use). Fixture steps, as direct database writes:
 * new accounts' emails are marked verified; the patient's visit is recorded
 * as completed (the booking lifecycle has its own specs); a new account is
 * made an administrator of the practice's organization for the reply and
 * flag, and removed again afterwards; the moderator gets the moderator role.
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
const person = (first: string) => ({ name: `${first} Reviewer${stamp}`, email: `e2e-rev-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const patient = person('Meera');
const staff = person('Practice');
const mod = person('Moderator');
const reviewText = `Gentle and on time — explained every step (${stamp}).`;
const state = { appointmentId: '', dentistSlug: '', organizationId: '', membershipIds: [] as string[] };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { id: true, dentistProfileId: true, locationId: true, location: { select: { organizationId: true, timezone: true } }, dentistProfile: { select: { slug: true, isDiscoverable: true } } } });
  test.skip(!practice || !practice.dentistProfile.isDiscoverable, 'Needs the development E2E practice with a discoverable dentist.');
  state.dentistSlug = practice!.dentistProfile.slug;
  state.organizationId = practice!.location.organizationId;
});

test.afterAll(async () => {
  if (state.membershipIds.length) {
    await prisma.organizationMember.deleteMany({ where: { id: { in: state.membershipIds } } });
    await prisma.roleAssignment.deleteMany({ where: { id: { in: state.membershipIds.map((m) => m.replace('om_', 'ra_')) } } });
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

test('a patient rates a visit that took place and the review appears on the dentist’s page', async ({ browser }) => {
  const { page, userId } = await register(browser, patient);
  const practice = await prisma.dentistPractice.findUniqueOrThrow({ where: { id: PRACTICE_ID }, select: { dentistProfileId: true, locationId: true, location: { select: { organizationId: true, timezone: true } } } });
  const startsAt = new Date(Date.now() - 26 * 3_600_000);
  state.appointmentId = id('apt');
  await prisma.appointment.create({
    data: {
      id: state.appointmentId,
      patientUserId: userId,
      practiceId: PRACTICE_ID,
      dentistProfileId: practice.dentistProfileId,
      locationId: practice.locationId,
      organizationId: practice.location.organizationId,
      serviceName: 'Consultation',
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      occupiedUntil: new Date(startsAt.getTime() + 30 * 60_000),
      timezone: practice.location.timezone,
      mode: 'INSTANT',
      status: 'COMPLETED',
      usesChair: false,
      confirmedAt: startsAt,
      completedAt: new Date(startsAt.getTime() + 30 * 60_000),
    },
  });

  await page.goto(`/account/appointments/${state.appointmentId}`);
  const card = page.getByRole('region', { name: 'Rate this visit' });
  await expect(card).toBeVisible({ timeout: 120_000 });
  await card.getByRole('button', { name: 'Publish review' }).click();
  await expect(card.getByText('Choose from 1 to 5 stars.')).toBeVisible();
  // The stars are decorative (aria-hidden); the radio is named "4 stars".
  await card.getByRole('radio', { name: '4 stars', exact: true }).check();
  await card.getByLabel(/^What was it like/).fill(reviewText);
  await card.getByRole('button', { name: 'Publish review' }).click();
  await expect(card.getByText('Thank you')).toBeVisible({ timeout: 60_000 });

  await page.goto(`/dentists/${state.dentistSlug}`);
  await page.setViewportSize({ width: 375, height: 812 });
  const reviews = page.getByRole('list', { name: 'Patient reviews' });
  await expect(reviews.getByText(reviewText)).toBeVisible({ timeout: 120_000 });
  await expect(reviews.getByText(`Meera R.`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('the practice replies, flags it, and a moderator hides it from the public page', async ({ browser }) => {
  const practiceSide = await register(browser, staff);
  const membershipId = id('om');
  state.membershipIds.push(membershipId);
  await prisma.organizationMember.create({ data: { id: membershipId, userId: practiceSide.userId, organizationId: state.organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: membershipId.replace('om_', 'ra_'), userId: practiceSide.userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await practiceSide.page.goto('/account/practice/reviews');
  const item = practiceSide.page.getByRole('region', { name: 'Review by Meera R.' }).filter({ hasText: reviewText });
  await expect(item).toBeVisible({ timeout: 120_000 });
  await item.getByRole('button', { name: 'Reply' }).click();
  await item.getByLabel('Public reply').fill('Thank you, Meera — see you at the follow-up.');
  await item.getByRole('button', { name: 'Publish reply' }).click();
  await expect(item.getByText('Reply published.')).toBeVisible({ timeout: 60_000 });
  await item.getByRole('button', { name: 'Flag for a moderator' }).click();
  await item.getByLabel('What is wrong with it?').fill('Testing the moderation path end to end.');
  await item.getByRole('button', { name: 'Send to a moderator' }).click();
  await expect(item.getByText(/Flagged\. A moderator will look at it/)).toBeVisible({ timeout: 60_000 });

  const moderator = await register(browser, mod);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: moderator.userId, roleKey: 'moderator' } });
  await moderator.page.goto('/admin/reviews');
  const flagged = moderator.page.getByRole('listitem').filter({ hasText: reviewText });
  await expect(flagged).toBeVisible({ timeout: 120_000 });
  await flagged.getByLabel('Reason the patient will see').fill('Removed after a moderation test.');
  await flagged.getByRole('button', { name: 'Hide' }).click();
  await expect(flagged.getByText(/hidden: Removed after a moderation test\./)).toBeVisible({ timeout: 60_000 });

  await moderator.page.goto(`/dentists/${state.dentistSlug}`);
  await expect(moderator.page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 120_000 });
  await expect(moderator.page.getByText(reviewText)).toHaveCount(0);
  const review = await prisma.review.findUniqueOrThrow({ where: { appointmentId: state.appointmentId }, include: { response: true } });
  expect(review).toMatchObject({ status: 'HIDDEN', rating: 4, flaggedAt: null });
  expect(review.response?.body).toBe('Thank you, Meera — see you at the follow-up.');
});
