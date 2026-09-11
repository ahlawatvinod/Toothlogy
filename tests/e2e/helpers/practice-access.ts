/**
 * The practice the Phase 4 browser journeys book, and a way in to run it.
 *
 * E2E_PRACTICE_ID, E2E_PRACTICE_IDENTIFIER and E2E_PRACTICE_PASSWORD still win
 * when set. Without them the journeys use a development practice that offers
 * video, and a dedicated administrator the test creates for itself:
 * registered through the real sign-up screen with a generated password, given
 * the clinic-administrator role on that practice's organization for the run,
 * and taken off it again afterwards. Production authentication is used
 * unchanged; no credential is stored or guessed.
 */

import { randomUUID } from 'node:crypto';
import type { Browser } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';

export interface PracticeAccess {
  readonly practiceId: string;
  readonly organizationId: string;
  readonly identifier: string;
  readonly password: string;
  /** How the credentials were obtained, for the test report. */
  readonly source: 'environment' | 'test-created administrator';
  readonly cleanup: () => Promise<void>;
}

export async function practiceAccess(prisma: PrismaClient, browser: Browser, label: string): Promise<PracticeAccess | null> {
  const envId = process.env.E2E_PRACTICE_ID ?? '';
  const select = { id: true, location: { select: { organizationId: true } } } as const;
  const practice = envId
    ? await prisma.dentistPractice.findUnique({ where: { id: envId }, select })
    : await prisma.dentistPractice.findFirst({
        where: { acceptsVideo: true, bookingPaused: false, dentistProfile: { isDiscoverable: true, isVerified: true }, location: { deletedAt: null } },
        orderBy: { createdAt: 'asc' },
        select,
      });
  if (!practice) return null;
  const organizationId = practice.location.organizationId;

  if (process.env.E2E_PRACTICE_IDENTIFIER && process.env.E2E_PRACTICE_PASSWORD) {
    return { practiceId: practice.id, organizationId, identifier: process.env.E2E_PRACTICE_IDENTIFIER, password: process.env.E2E_PRACTICE_PASSWORD, source: 'environment', cleanup: async () => {} };
  }

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const admin = { name: `E2E Practice Admin ${label} ${stamp}`, email: `e2e-practice-admin-${label}-${stamp}@example.test`, password: `e2e passphrase ${randomUUID()}` };
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/register');
  await page.getByLabel('Your name').fill(admin.name);
  await page.getByLabel('Email address').fill(admin.email);
  await page.locator('input[type="password"][autocomplete="new-password"]').fill(admin.password);
  await page.locator('#acceptedTerms').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/account', { timeout: 120_000 });
  await context.close();

  const user = await prisma.user.update({ where: { email: admin.email }, data: { emailVerifiedAt: new Date() } });
  const memberId = `om_e2e_${stamp}`;
  const roleId = `ra_e2e_${stamp}`;
  await prisma.organizationMember.create({ data: { id: memberId, userId: user.id, organizationId, roleKey: 'clinic_admin' } });
  await prisma.roleAssignment.create({ data: { id: roleId, userId: user.id, roleKey: 'clinic_admin', organizationId } });
  return {
    practiceId: practice.id,
    organizationId,
    identifier: admin.email,
    password: admin.password,
    source: 'test-created administrator',
    cleanup: async () => {
      await prisma.roleAssignment.deleteMany({ where: { id: roleId } });
      await prisma.organizationMember.deleteMany({ where: { id: memberId } });
    },
  };
}

/**
 * Make sure a practice's lead wallet holds at least `minimumMinor`, crediting
 * the shortfall as a clearly labelled fixture top-up (one TOP_UP ledger entry
 * and the matching balance) — the step staff take from the billing console.
 * Returns the balance before the test runs.
 */
export async function ensureWallet(prisma: PrismaClient, organizationId: string, minimumMinor: bigint): Promise<bigint> {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { organizationId } });
    if (!wallet) throw new Error('The E2E practice has no wallet; recharge it once in the staff console.');
    if (wallet.balanceMinor >= minimumMinor) return wallet.balanceMinor;
    const shortfall = minimumMinor - wallet.balanceMinor;
    const after = wallet.balanceMinor + shortfall;
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    await tx.ledgerEntry.create({
      data: { id: `lgr_e2e_${stamp}`, walletId: wallet.id, kind: 'TOP_UP', amountMinor: shortfall, balanceAfterMinor: after, currency: wallet.currency, idempotencyKey: `e2e-fixture-topup-${stamp}`, externalReference: 'E2E-FIXTURE-TOPUP', memo: 'E2E fixture top-up for the sponsored journey' },
    });
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: after } });
    return after;
  });
}
