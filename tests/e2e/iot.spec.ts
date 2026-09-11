/**
 * TL-TEST-E2E-IOT-001 — connected equipment in a real browser.
 *
 * A practice administrator registers an autoclave and copies its one-time
 * token, sets its temperature limits; the device (a plain HTTP client with no
 * session) reports a low temperature; the device page shows the reading and
 * an open alert, fits a phone, and the administrator resolves the alert. A
 * wrong token is refused.
 *
 * Fixture steps, as direct database writes: the new account's email is
 * marked verified; it is made an administrator of the E2E practice's
 * organization (removed afterwards); the test device is retired at the end
 * (its history stays, as for any device).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
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
const owner = { name: `Owner Kit${stamp}`, email: `e2e-iot-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
const deviceName = `Autoclave ${stamp}`;
const state = { organizationId: '', membershipId: '', deviceId: '' };

test.beforeAll(async () => {
  const practice = await prisma.dentistPractice.findUnique({ where: { id: PRACTICE_ID }, select: { location: { select: { organizationId: true } } } });
  test.skip(!practice, 'Needs the development E2E practice.');
  state.organizationId = practice!.location.organizationId;
});

test.afterAll(async () => {
  if (state.deviceId) await prisma.device.updateMany({ where: { id: state.deviceId, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
  if (state.membershipId) {
    await prisma.organizationMember.deleteMany({ where: { id: state.membershipId } });
    await prisma.roleAssignment.deleteMany({ where: { id: state.membershipId.replace('om_', 'ra_') } });
  }
  await prisma.$disconnect();
});

test('an administrator registers a device; its low reading raises an alert they resolve', async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(owner.name);
  await page.getByLabel('Email address').fill(owner.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(owner.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  const user = await prisma.user.update({ where: { email: owner.email }, data: { emailVerifiedAt: new Date() } });
  state.membershipId = `om_e2e_${stamp}_iot`;
  await prisma.organizationMember.create({ data: { id: state.membershipId, userId: user.id, organizationId: state.organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: state.membershipId.replace('om_', 'ra_'), userId: user.id, roleKey: 'clinic_admin', organizationId: state.organizationId } });

  await page.goto(`/account/organizations/${state.organizationId}/devices`);
  const form = page.getByRole('region', { name: 'Register a device' });
  await expect(form).toBeVisible({ timeout: 120_000 });
  await form.getByLabel('Name').fill(deviceName);
  await form.getByRole('button', { name: 'Register device' }).click();
  const tokenBox = form.getByLabel('Device token');
  await expect(tokenBox).toBeVisible({ timeout: 60_000 });
  const token = (await tokenBox.textContent())!.trim();
  expect(token).toMatch(/^tld_/);
  await form.getByRole('link', { name: 'Open the device' }).click();
  await page.waitForURL(/\/devices\/dev_/, { timeout: 120_000 });
  state.deviceId = page.url().split('/').pop()!;

  const limits = page.getByRole('region', { name: 'Limits' });
  const first = limits.getByRole('listitem', { name: 'Limit 1' });
  await expect(first.getByLabel('Reading')).toHaveValue('temperature_c');
  await first.getByLabel('Lowest').fill('121');
  await first.getByLabel('Highest').fill('138');
  await limits.getByRole('button', { name: 'Save limits' }).click();
  await expect(limits.getByText('Limits saved.', { exact: false })).toBeVisible({ timeout: 60_000 });

  // The device: no session, only its token.
  expect((await request.post('/api/v1/devices/telemetry', { headers: { Authorization: `Device tld_${'A'.repeat(43)}` }, data: { readings: [{ metric: 'temperature_c', value: 110 }] } })).status()).toBe(401);
  const sent = await request.post('/api/v1/devices/telemetry', { headers: { Authorization: `Device ${token}` }, data: { readings: [{ metric: 'temperature_c', value: 110 }] } });
  expect(sent.status()).toBe(200);
  expect((await sent.json()).data).toEqual({ accepted: 1, alertsOpened: 1 });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const alerts = page.getByRole('list', { name: 'Open alerts' });
  await expect(alerts.getByText('temperature_c 110 is below the lowest allowed (121)')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('table', { name: 'Latest readings' }).getByRole('cell', { name: '110' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await alerts.getByLabel('What was done (optional)').fill('Door seal replaced; cycle re-run.');
  await alerts.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('No open alerts.')).toBeVisible({ timeout: 60_000 });
  const alert = await prisma.deviceAlert.findFirstOrThrow({ where: { deviceId: state.deviceId } });
  expect(alert).toMatchObject({ resolutionNote: 'Door seal replaced; cycle re-run.', openKey: null });
});
