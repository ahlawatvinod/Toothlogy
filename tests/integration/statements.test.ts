/**
 * TL-TEST-STATEMENTS-001 — the scheduled monthly lead-wallet statement.
 *
 * `billing.statements` issues last month's statement (UTC calendar month, as
 * the on-demand route counts it) for each wallet with lead charges or refunds
 * in it — charges add, refunds subtract, top-ups are not billed — links those
 * entries to it, and is safe to run again: a wallet and month have one
 * statement, and the on-demand route returns the same one.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { issueInvoice, issueMonthlyStatements } from '@/platform/billing/service';
import { assertSeeded, describeIntegration, disconnectTestDb, resetDatabase, testDb } from '../helpers/database';

const NOW = new Date('2026-09-11T10:00:00Z');
const AUGUST = new Date('2026-08-15T06:00:00Z');
let n = 0;

async function walletFor(label: string) {
  const organizationId = `org_stm_${label}`;
  await testDb().organization.create({ data: { id: organizationId, type: 'CLINIC', name: `Statement clinic ${label}`, slug: `statement-clinic-${label}`, countryCode: 'IN', timezone: 'Asia/Kolkata', currency: 'INR', status: 'PENDING' } });
  const wallet = await testDb().wallet.create({ data: { id: `wal_stm_${label}`, organizationId, currency: 'INR', balanceMinor: 100_000n } });
  return { organizationId, walletId: wallet.id };
}

async function entry(walletId: string, kind: 'TOP_UP' | 'LEAD_CHARGE' | 'REFUND', amountMinor: bigint, createdAt: Date, net?: bigint, tax?: bigint) {
  n += 1;
  await testDb().ledgerEntry.create({ data: { id: `lgr_stm_${n}`, walletId, kind, amountMinor, balanceAfterMinor: 100_000n, currency: 'INR', netMinor: net ?? null, taxMinor: tax ?? null, idempotencyKey: `stm-${n}`, createdAt } });
}

describeIntegration('Monthly statements', () => {
  beforeAll(async () => {
    await assertSeeded();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await disconnectTestDb();
  });

  it('issues last month’s statement once per wallet, with charges less refunds and no top-ups', async () => {
    const busy = await walletFor('busy');
    const quiet = await walletFor('quiet');
    await entry(busy.walletId, 'TOP_UP', 118_000n, AUGUST);
    await entry(busy.walletId, 'LEAD_CHARGE', -5_900n, AUGUST, -5_000n, -900n);
    await entry(busy.walletId, 'LEAD_CHARGE', -5_900n, AUGUST, -5_000n, -900n);
    await entry(busy.walletId, 'REFUND', 5_900n, AUGUST, 5_000n, 900n);
    await entry(busy.walletId, 'LEAD_CHARGE', -5_900n, new Date('2026-09-02T06:00:00Z'), -5_000n, -900n); // this month: not yet
    await entry(quiet.walletId, 'LEAD_CHARGE', -5_900n, new Date('2026-07-20T06:00:00Z'), -5_000n, -900n); // two months ago

    expect(await issueMonthlyStatements(NOW)).toEqual({ period: '2026-08', statements: 1 });
    const statements = await testDb().invoice.findMany({ where: { walletId: busy.walletId } });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({ periodStart: new Date('2026-08-01T00:00:00Z'), periodEnd: new Date('2026-09-01T00:00:00Z'), subtotalMinor: 5_000n, taxMinor: 900n, totalMinor: 5_900n });
    expect(statements[0]!.number).toMatch(/^STM-202608-/);
    expect(await testDb().ledgerEntry.count({ where: { invoiceId: statements[0]!.id } })).toBe(3);
    expect(await testDb().invoice.count({ where: { walletId: quiet.walletId } })).toBe(0);

    // Again: nothing new, and the on-demand route returns the same statement.
    expect(await issueMonthlyStatements(NOW)).toEqual({ period: '2026-08', statements: 0 });
    expect((await issueInvoice(busy.organizationId, new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))).id).toBe(statements[0]!.id);
    expect(await testDb().invoice.count()).toBe(1);
  });
});
