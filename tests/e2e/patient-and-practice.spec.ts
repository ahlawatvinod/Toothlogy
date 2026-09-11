/**
 * TL-TEST-E2E-BOOKING-001 — the Phase 4 chain in a real browser.
 *
 * Patient: register → search → dentist → service → type → date → slot → book
 *          → appointment → reschedule → cancel → rebook.
 * Practice: receive → confirm → check in → start → complete; the lead is
 *          qualified, billed by the tiered rule and marked converted.
 *
 * Runs against the running development server and its development database,
 * through the real screens and APIs. The practice and the way in come from
 * helpers/practice-access.ts: E2E_PRACTICE_ID / _IDENTIFIER / _PASSWORD when
 * set (never committed), otherwise a development practice that offers video
 * (with a session covering the next hour) and an administrator the test
 * registers for itself and removes afterwards. DATABASE_URL is the
 * development database, for assertions.
 *
 * One fixture step writes to the database directly: the new patient's email
 * is marked verified. No email provider is connected in development, so the
 * verification email cannot arrive, and an unverified patient's lead is —
 * correctly — never billable. Production code is unchanged by this.
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { practiceAccess, type PracticeAccess } from './helpers/practice-access';

function envLocal(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync('.env.local')) return undefined;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '');
}

let access: PracticeAccess | null = null;
const prisma = new PrismaClient({ datasources: { db: { url: envLocal('DATABASE_URL') } } });

const stamp = Date.now().toString(36);
const patient = { name: `E2E Patient ${stamp}`, email: `e2e-patient-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const state: { dentistName: string; dentistSlug: string; rebookedId: string; firstId: string } = { dentistName: '', dentistSlug: '', rebookedId: '', firstId: '' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  access = await practiceAccess(prisma, browser, 'booking');
  test.skip(!access, 'No development practice offers video; set E2E_PRACTICE_ID.');
  const practice = await prisma.dentistPractice.findUniqueOrThrow({
    where: { id: access!.practiceId },
    select: { acceptsVideo: true, dentistProfile: { select: { slug: true, isDiscoverable: true, user: { select: { displayName: true } } } } },
  });
  expect(practice.acceptsVideo, 'the E2E practice must offer video consultations').toBe(true);
  expect(practice.dentistProfile.isDiscoverable, 'the E2E dentist must be discoverable').toBe(true);
  state.dentistName = practice.dentistProfile.user.displayName ?? '';
  state.dentistSlug = practice.dentistProfile.slug;
});

test.afterAll(async () => {
  await access?.cleanup();
  await prisma.$disconnect();
});

/** The first free time in the slot picker, once it has loaded. */
async function pickFirstTime(page: Page): Promise<string> {
  const times = page.getByRole('group', { name: /(Morning|Afternoon|Evening) times/ }).getByRole('button');
  // A development server compiles each API route on first use (up to ~40 s).
  await expect(times.first()).toBeVisible({ timeout: 120_000 });
  const label = (await times.first().textContent())?.trim() ?? '';
  await times.first().click();
  return label;
}

test('patient: register → search → dentist → service → slot → book → reschedule → cancel → rebook', async ({ page }) => {
  // Register through the real form; registration signs the patient in.
  await page.goto('/register');
  await page.getByLabel('Your name').fill(patient.name);
  await page.getByLabel('Email address').fill(patient.email);
  // The required marker is part of the field's accessible name; target the input.
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(patient.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account');
  // Fixture step (see header): no email provider, so verify directly.
  await prisma.user.update({ where: { email: patient.email }, data: { emailVerifiedAt: new Date() } });

  // Search for a dentist taking video consultations, then open the profile.
  await page.goto('/find?type=dentist&appointmentType=VIDEO');
  const result = page.getByRole('region', { name: state.dentistName });
  await expect(result.getByText(/Next free video consultation/)).toBeVisible();
  await result.getByRole('link', { name: state.dentistName }).first().click();
  await page.waitForURL(`**/dentists/${state.dentistSlug}`);
  await page.getByRole('link', { name: 'Book', exact: true }).first().click();
  await page.waitForURL('**/book/**');

  // Service, type, date and slot, then send the request.
  await page.getByLabel(/^Consultation —/).check();
  await page.getByLabel('Video consultation').check();
  await pickFirstTime(page);
  await page.getByRole('button', { name: /^(Send request|Book)$/ }).click();
  await expect(page.getByText(/Request sent|Booked and confirmed/)).toBeVisible();
  await page.getByRole('link', { name: 'View your appointment' }).click();
  await page.waitForURL(/\/account\/appointments\/apt_/);
  state.firstId = page.url().split('/').pop()!;
  const booked = await prisma.appointment.findUniqueOrThrow({ where: { id: state.firstId } });
  expect([booked.type, booked.source]).toEqual(['VIDEO', 'PROFILE']);
  await expect(page.getByText(/No video service is connected to Toothlogy yet/)).toBeVisible();

  // Reschedule to another free time.
  await page.getByRole('button', { name: 'Change time' }).click();
  await pickFirstTime(page);
  await page.getByRole('button', { name: /^Move to / }).click();
  await expect(page.getByText(/^Moved/)).toBeVisible();
  const moved = await prisma.appointment.findUniqueOrThrow({ where: { id: state.firstId } });
  expect(moved.startsAt.getTime()).not.toBe(booked.startsAt.getTime());
  expect(moved.rescheduleCount).toBe(1);

  // Cancel with a reason.
  await page.getByRole('button', { name: 'Cancel appointment' }).click();
  await page.getByLabel('Reason').fill('E2E: plans changed');
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.getByText('Cancelled. The clinic has been told.')).toBeVisible();
  await expect.poll(async () => (await prisma.appointment.findUniqueOrThrow({ where: { id: state.firstId } })).status).toBe('CANCELLED');

  // Rebook: the same dentist, revalidated against current availability.
  await page.reload();
  await page.getByRole('link', { name: /^(Book again|Book the follow-up)$/ }).click();
  await page.waitForURL(/\/book\/.*rebook=/);
  await page.getByLabel('Video consultation').check();
  await pickFirstTime(page);
  await page.getByRole('button', { name: /^(Send request|Book)$/ }).click();
  await expect(page.getByText(/Request sent|Booked and confirmed/)).toBeVisible();
  await page.getByRole('link', { name: 'View your appointment' }).click();
  await page.waitForURL(/\/account\/appointments\/apt_/);
  state.rebookedId = page.url().split('/').pop()!;
  const rebooked = await prisma.appointment.findUniqueOrThrow({ where: { id: state.rebookedId } });
  expect([rebooked.rebookedFromId, rebooked.source, rebooked.type]).toEqual([state.firstId, 'REBOOK', 'VIDEO']);

  const events = await prisma.appointmentEvent.findMany({ where: { appointmentId: state.firstId }, orderBy: { createdAt: 'asc' } });
  expect(events.map((e) => e.action)).toEqual(['BOOK', 'RESCHEDULE', 'CANCEL']);
});

test('practice: receive → confirm → check in → start → complete; the lead is billed by the tiered rule and converted', async ({ page }) => {
  expect(state.rebookedId, 'the patient flow must have run first').not.toBe('');

  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(access!.identifier);
  await page.locator('input[type="password"]').fill(access!.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/account**');

  // The request is waiting on the practice dashboard.
  await page.goto('/account/practice');
  await expect(page.getByText(patient.name).first()).toBeVisible();

  const status = async () => (await prisma.appointment.findUniqueOrThrow({ where: { id: state.rebookedId } })).status;

  // Fixture step: check-in opens 60 minutes before the appointment (the
  // product rule, unchanged). Run late in the day, the next free slot is
  // tomorrow, so move this appointment to start in 30 minutes — same length,
  // same diary buffer — so the journey can be walked now.
  const booked = await prisma.appointment.findUniqueOrThrow({ where: { id: state.rebookedId } });
  if (booked.startsAt.getTime() - Date.now() > 60 * 60_000) {
    const shift = Date.now() + 30 * 60_000 - booked.startsAt.getTime();
    await prisma.appointment.update({
      where: { id: booked.id },
      data: { startsAt: new Date(booked.startsAt.getTime() + shift), endsAt: new Date(booked.endsAt.getTime() + shift), occupiedUntil: new Date(booked.occupiedUntil.getTime() + shift) },
    });
  }

  await page.goto(`/account/practice/appointments/${state.rebookedId}`);
  for (const [button, expected] of [
    ['Confirm', 'CONFIRMED'],
    ['Check in', 'CHECKED_IN'],
    ['Start', 'IN_PROGRESS'],
  ] as const) {
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect.poll(status).toBe(expected);
    await page.reload();
  }
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
  await expect.poll(status).toBe('COMPLETED');

  // The lead: qualified on confirmation, billed free or paid by the tiered
  // rule, delivered, completed — then converted by the practice.
  const lead = async () => prisma.lead.findUniqueOrThrow({ where: { appointmentId: state.rebookedId } });
  await expect.poll(async () => (await lead()).status).toBe('COMPLETED');
  const billed = await lead();
  expect(['FREE', 'CHARGED']).toContain(billed.billingStatus);
  expect(billed.billingOrdinal).not.toBeNull();
  if (billed.billingStatus === 'CHARGED') {
    const charge = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: billed.chargeEntryId! } });
    expect(charge.amountMinor).toBe(BigInt(-5900));
  }

  await page.goto('/account/practice/leads');
  const row = page.locator('li').filter({ hasText: patient.name }).filter({ has: page.getByRole('button', { name: /Mark converted/ }) });
  await expect(row.getByText(billed.billingStatus === 'FREE' ? `Free (lead ${billed.billingOrdinal})` : /Charged ₹59\.00/)).toBeVisible();
  await row.getByRole('button', { name: /Mark converted/ }).click();
  await expect.poll(async () => (await lead()).status).toBe('CONVERTED');

  // The patient heard about each step, in the app, from the outbox.
  const patientUser = await prisma.user.findUniqueOrThrow({ where: { email: patient.email } });
  await expect
    .poll(async () => (await prisma.notificationRecord.findMany({ where: { userId: patientUser.id, channel: 'IN_APP' } })).map((n) => n.notificationId))
    .toEqual(expect.arrayContaining(['TL-NOTIF-APPOINTMENT-REQUESTED-001', 'TL-NOTIF-APPOINTMENT-CONFIRMED-001', 'TL-NOTIF-APPOINTMENT-CHECKED-IN-001', 'TL-NOTIF-APPOINTMENT-COMPLETED-001']));
});
