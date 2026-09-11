/**
 * TL-PAGE-ADMIN-FX-001 — /admin/exchange-rates
 *
 * Exchange rates staff record with their source and date. Used only for a
 * labelled approximate total across currencies in platform analytics —
 * never to price, charge or convert anyone's money. 404 without
 * tl.admin.fx_rate.manage.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { FX_MANAGE, listRates } from '@/platform/globalization/exchange-rates';
import { CURRENCIES } from '@/registry/globalization';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { RecordRateForm } from '@/components/enterprise/enterprise-forms';

export const metadata: Metadata = { title: 'Exchange rates (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ExchangeRatesPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/exchange-rates');
  if (!can(principal, FX_MANAGE)) notFound();
  const rates = await listRates(principal);
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Exchange rates</h1>
        <p className="tl-page__lead">Recorded rates are used for one thing: an approximate total across currencies in platform analytics, labelled as approximate. Prices, wallets, orders and invoices always stay in their own currency.</p>
      </header>
      <Card label="Recorded rates">
        <CardHeader>
          <strong>Recorded rates</strong>
        </CardHeader>
        <CardBody>
          {rates.length === 0 ? (
            <EmptyState title="No rates recorded" description="Without a rate, platform analytics shows each currency separately and no total." />
          ) : (
            <ul className="tl-list" aria-label="Rates">
              {rates.map((r) => (
                <li key={r.id} className="tl-list__meta">
                  1 {r.baseCurrency} = {r.rate} {r.quoteCurrency} · as of {day(r.asOf)} · {r.source}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card label="Record a rate">
        <CardHeader>
          <strong>Record a rate</strong>
        </CardHeader>
        <CardBody>
          <RecordRateForm currencies={CURRENCIES.map((c) => ({ code: c.code, name: c.name }))} today={new Date().toISOString().slice(0, 10)} />
        </CardBody>
      </Card>
    </div>
  );
}
