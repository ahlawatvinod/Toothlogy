/**
 * TL-PAGE-ADMIN-BILLING-001 — /admin/billing
 *
 * Staff billing console: record transfers received outside the platform
 * (with their reference), reverse mistaken entries, and decide lead-charge
 * disputes. 404 for anyone without the staff billing permissions.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { formatMoney } from '@/platform/money';
import { StaffBilling } from './staff-billing';

export const metadata: Metadata = { title: 'Billing (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminBillingPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/billing');
  const canAdjust = can(principal, 'tl.billing.ledger.adjust');
  const canResolve = can(principal, 'tl.billing.dispute.resolve');
  if (!canAdjust && !canResolve) notFound();

  const [organizations, wallets, disputes, entries] = await Promise.all([
    db().organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
    db().wallet.findMany({ include: { organization: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: 50 }),
    db().leadDispute.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: { lead: { select: { id: true, source: true, status: true, priceMinor: true, taxMinor: true, currency: true, organization: { select: { name: true } } } } },
      take: 100,
    }),
    db().ledgerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { wallet: { select: { organization: { select: { name: true } } } } } }),
  ]);
  const money = (minor: bigint, currency: string) => formatMoney({ amountMinor: minor, currency }, 'en-IN');
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '56rem' }}>
      <header className="tl-page__header">
        <h1>Billing (staff)</h1>
        <p className="tl-page__lead">Every action here is audited. Credits need the bank or transfer reference they came with.</p>
      </header>
      <StaffBilling
        canAdjust={canAdjust}
        canResolve={canResolve}
        organizations={organizations}
        wallets={wallets.map((w) => ({ organization: w.organization.name, balance: money(w.balanceMinor, w.currency) }))}
        disputes={disputes.map((d) => ({
          id: d.id,
          organization: d.lead.organization.name,
          reason: d.reason,
          note: d.note,
          raised: when(d.createdAt),
          charge: d.lead.priceMinor !== null && d.lead.currency ? money(d.lead.priceMinor + (d.lead.taxMinor ?? BigInt(0)), d.lead.currency) : '—',
          selfRaised: d.raisedByUserId === principal.userId,
        }))}
        entries={entries.map((e) => ({
          id: e.id,
          organization: e.wallet.organization.name,
          kind: e.kind,
          amount: `${e.amountMinor < BigInt(0) ? '−' : '+'}${money(e.amountMinor < BigInt(0) ? -e.amountMinor : e.amountMinor, e.currency)}`,
          when: when(e.createdAt),
          reference: e.externalReference ?? e.memo ?? '',
          reversible: e.kind === 'TOP_UP' || e.kind === 'ADJUSTMENT',
        }))}
      />
    </div>
  );
}
