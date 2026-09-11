/**
 * TL-TEST-E2E-MESSAGING-SUPPORT-001 — messages and help in a real browser.
 *
 * A patient writes to the practice from an appointment; a practice admin
 * sees it unread, opens and answers it; the patient sees the reply (the
 * conversation fits a phone). The practice is told who wrote — never what.
 *
 * A patient asks Toothlogy for help; a support agent adds an internal note
 * and replies; the patient sees the reply but not the note, and closes it.
 *
 * Fixture steps, as direct database writes: new accounts' emails are marked
 * verified; the patient's visit is recorded; a new account is made an
 * administrator of the E2E practice's organization (removed afterwards); the
 * agent gets the support_agent role.
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
const person = (first: string) => ({ name: `${first} Writer${stamp}`, email: `e2e-msg-${first.toLowerCase()}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` });
const patient = person('Asha');
const staff = person('Frontdesk');
const agent = person('Agent');
const question = `Can I eat before the scaling? (${stamp})`;
const state = { organizationId: '', membershipIds: [] as string[], ticketTitle: `Cannot see my invoice ${stamp}` };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { location: { select: { organizationId: true } } } });
  test.skip(!practice, 'Needs the development E2E practice.');
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

let patientSide: { page: Page; userId: string };

test('a patient writes to the practice from an appointment and sees the answer', async ({ browser }) => {
  patientSide = await register(browser, patient);
  const practice = await prisma.dentistPractice.findUniqueOrThrow({ where: { id: PRACTICE_ID }, select: { dentistProfileId: true, locationId: true, location: { select: { organizationId: true, timezone: true } } } });
  // A day of its own, so reruns never meet the diary's no-overlap constraint.
  const startsAt = new Date(Date.now() + (40 + Math.floor(Math.random() * 400)) * 24 * 3_600_000);
  const appointmentId = id('apt');
  await prisma.appointment.create({
    data: { id: appointmentId, patientUserId: patientSide.userId, practiceId: PRACTICE_ID, dentistProfileId: practice.dentistProfileId, locationId: practice.locationId, organizationId: practice.location.organizationId, serviceName: 'Scaling', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), occupiedUntil: new Date(startsAt.getTime() + 30 * 60_000), timezone: practice.location.timezone, mode: 'INSTANT', status: 'CONFIRMED', usesChair: false, confirmedAt: new Date() },
  });

  const page = patientSide.page;
  await page.goto(`/account/appointments/${appointmentId}`);
  await page.getByRole('link', { name: 'Message the practice about this appointment' }).click();
  const form = page.getByRole('region', { name: 'New message' });
  await expect(form.getByText('About your appointment with them.')).toBeVisible({ timeout: 120_000 });
  await form.getByRole('button', { name: 'Send message' }).click();
  await expect(form.getByText('Say what it is about.')).toBeVisible();
  await form.getByLabel('Subject').fill('Before my scaling');
  await form.getByLabel('Message').fill(question);
  await form.getByRole('button', { name: 'Send message' }).click();
  await page.waitForURL(/\/account\/messages\/thr_/, { timeout: 120_000 });
  await expect(page.getByRole('list', { name: 'Messages' }).getByText(question)).toBeVisible({ timeout: 60_000 });

  // The practice is told who wrote, not what.
  const thread = await prisma.messageThread.findFirstOrThrow({ where: { patientUserId: patientSide.userId }, include: { messages: true } });
  expect(thread).toMatchObject({ appointmentId, status: 'OPEN', subject: 'Before my scaling' });
  const practiceSide = await register(browser, staff);
  const membershipId = id('om');
  state.membershipIds.push(membershipId);
  await prisma.organizationMember.create({ data: { id: membershipId, userId: practiceSide.userId, organizationId: state.organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: membershipId.replace('om_', 'ra_'), userId: practiceSide.userId, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await practiceSide.page.goto('/account/practice/messages');
  const row = practiceSide.page.getByRole('listitem').filter({ hasText: 'Before my scaling' }).filter({ hasText: patient.name });
  await expect(row).toBeVisible({ timeout: 120_000 });
  await expect(row.getByText('new', { exact: true })).toBeVisible();
  await row.getByRole('link', { name: 'Before my scaling' }).click();
  await practiceSide.page.waitForURL(/\/account\/practice\/messages\/thr_/, { timeout: 120_000 });
  await expect(practiceSide.page.getByText(question)).toBeVisible({ timeout: 60_000 });
  await practiceSide.page.getByLabel('Your message').fill('A light breakfast is fine — no need to fast.');
  await practiceSide.page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(practiceSide.page.getByRole('list', { name: 'Messages' }).getByText('A light breakfast is fine')).toBeVisible({ timeout: 60_000 });

  await page.goto('/account/messages');
  const mine = page.getByRole('region', { name: 'Before my scaling' });
  await expect(mine.getByText('new reply')).toBeVisible({ timeout: 120_000 });
  await mine.getByRole('link', { name: 'Before my scaling' }).click();
  await page.waitForURL(/\/account\/messages\/thr_/, { timeout: 120_000 });
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('list', { name: 'Messages' }).getByText('A light breakfast is fine — no need to fast.')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  // The patient is told who answered, not what (the practice admin joined
  // after the first message, so the patient's notice is the one to check).
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: state.organizationId }, select: { name: true } });
  const toPatient = await prisma.inAppNotification.findFirstOrThrow({ where: { userId: patientSide.userId, notificationId: 'TL-NOTIF-NEW-MESSAGE-001' } });
  expect(toPatient.body).toContain(organization.name);
  expect(toPatient.body).not.toContain('breakfast');
});

test('a patient asks Toothlogy for help; an agent notes privately, replies, and the patient closes it', async ({ browser }) => {
  const page = patientSide.page;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/help');
  const ask = page.getByRole('region', { name: 'Ask for help' });
  await expect(ask).toBeVisible({ timeout: 120_000 });
  await ask.getByLabel('It is about').selectOption({ label: 'Wallet, leads or billing' });
  await ask.getByLabel('Title').fill(state.ticketTitle);
  await ask.getByLabel('What happened?').fill('The invoice page shows nothing after I paid at the clinic.');
  await ask.getByRole('button', { name: 'Send to Toothlogy' }).click();
  await page.waitForURL(/\/help\/tickets\/tkt_/, { timeout: 120_000 });
  const ticketUrl = page.url();
  await expect(page.getByRole('heading', { level: 1, name: state.ticketTitle })).toBeVisible({ timeout: 60_000 });

  const support = await register(browser, agent);
  await prisma.roleAssignment.create({ data: { id: id('ra'), userId: support.userId, roleKey: 'support_agent' } });
  await support.page.goto('/admin/support');
  const queued = support.page.getByRole('region', { name: state.ticketTitle });
  await expect(queued).toBeVisible({ timeout: 120_000 });
  await queued.getByRole('link', { name: state.ticketTitle }).click();
  await support.page.waitForURL(/\/help\/tickets\/tkt_/, { timeout: 120_000 });
  const reply = support.page.getByRole('region', { name: 'Reply' });
  await expect(reply).toBeVisible({ timeout: 60_000 });
  await reply.getByLabel(/^Internal note — the requester/).check();
  await reply.getByLabel('Internal note (staff only)').fill('Clinic payments are not recorded on Toothlogy — explain.');
  await reply.getByRole('button', { name: 'Add note' }).click();
  await expect(reply.getByText('Note added.')).toBeVisible({ timeout: 60_000 });
  await reply.getByLabel(/^Internal note — the requester/).uncheck();
  await reply.getByLabel('Your reply').fill('Payments made at the clinic are between you and the clinic; ask them for the receipt.');
  await reply.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(reply.getByText('Sent.')).toBeVisible({ timeout: 60_000 });
  await expect(support.page.getByRole('list', { name: 'Conversation' }).getByText('internal note', { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.goto(ticketUrl);
  const conversation = page.getByRole('list', { name: 'Conversation' });
  await expect(conversation.getByText(/Payments made at the clinic/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Clinic payments are not recorded/)).toHaveCount(0);
  await expect(page.getByText('Waiting for you')).toBeVisible();
  await page.getByRole('button', { name: 'Close request' }).click();
  await expect(page.getByText('This request is closed.')).toBeVisible({ timeout: 60_000 });

  const ticket = await prisma.supportTicket.findFirstOrThrow({ where: { subject: state.ticketTitle }, include: { messages: true } });
  expect(ticket.status).toBe('CLOSED');
  expect(ticket.category).toBe('BILLING');
  expect(ticket.messages.map((m) => [m.fromStaff, m.internal])).toEqual([
    [false, false],
    [true, true],
    [true, false],
  ]);
});
