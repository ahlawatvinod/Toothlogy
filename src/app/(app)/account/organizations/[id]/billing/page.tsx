/**
 * TL-PAGE-ORG-BILLING-001 — /account/organizations/:id/billing
 *
 * The organization's lead wallet: balance, how qualified leads are billed
 * (the free allowance, then the price plus GST), what a recharge costs, a
 * statement of account for any date range, every ledger entry, issued monthly
 * statements and disputes. All from configuration and the ledger — no amount
 * is written in this file.
 *
 * Card/UPI recharge needs a payment provider, and none is connected. So the
 * page does not show a recharge button that could only fail; it says how
 * funds are added today — a bank transfer that Toothlogy staff record with its
 * reference — and a working recharge appears here only once a provider is
 * configured.
 *
 * A statement is labelled as a statement of account, never as a tax invoice.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { accountStatement, STATEMENT_NOTICE, walletOverview } from '@/platform/billing/service';
import { isAppError } from '@/platform/kernel/errors';
import { formatMoney } from '@/platform/money';
import { localDateOf } from '@/lib/zoned-time';
import { Alert, Badge, Card, CardBody, CardHeader, Table } from '@/design-system';
import { BillingActions } from './billing-actions';

export const metadata: Metadata = { title: 'Billing', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  TOP_UP: 'Recharge',
  LEAD_CHARGE: 'Paid lead',
  REFUND: 'Refund',
  REVERSAL: 'Reversal',
  ADJUSTMENT: 'Credit from Toothlogy',
};

const ZERO = BigInt(0);
const abs = (v: bigint | null) => (v === null ? ZERO : v < ZERO ? -v : v);

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/organizations/${id}/billing`);
  if (!can(principal, 'tl.billing.wallet.read', { organizationId: id })) notFound();

  const [overview, organization] = await Promise.all([
    walletOverview(principal, id),
    db().organization.findUniqueOrThrow({ where: { id }, select: { name: true, timezone: true } }),
  ]);
  const { wallet, quote, recharge, free } = overview;
  const money = (minor: bigint) => formatMoney({ amountMinor: minor, currency: wallet.currency }, 'en-IN');
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: organization.timezone }).format(d);
  const month = (d: Date) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);

  const sp = await searchParams;
  const todayLocal = localDateOf(new Date(), organization.timezone);
  const from = typeof sp.from === 'string' && sp.from ? sp.from : `${todayLocal.slice(0, 8)}01`;
  const to = typeof sp.to === 'string' && sp.to ? sp.to : todayLocal;
  let statement: Awaited<ReturnType<typeof accountStatement>> | null = null;
  let statementError: string | null = null;
  try {
    statement = await accountStatement(principal, id, from, to);
  } catch (error) {
    if (isAppError(error) && error.code === 'VALIDATION_FAILED') statementError = error.message;
    else throw error;
  }
  const rate = quote ? quote.taxRateBasisPoints / 100 : 0;

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Billing</span>
      </nav>
      <header className="tl-page__header">
        <h1>Lead wallet</h1>
        <p className="tl-page__lead">
          Paid leads and Prime campaigns are paid from this prepaid wallet. It never goes below zero.{' '}
          <Link href={`/account/organizations/${id}/campaigns`}>Prime campaigns</Link>
        </p>
      </header>

      <Card label="Balance">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Balance</dt>
              <dd style={{ fontSize: 'var(--tl-text-xl)' }}>{money(wallet.balanceMinor)}</dd>
            </div>
            <div>
              <dt>Paid leads this month</dt>
              <dd>
                {overview.monthCharges.count} · {money(overview.monthCharges.grossMinor)}
              </dd>
            </div>
            {quote && recharge ? (
              <div>
                <dt>Balance covers</dt>
                <dd>{(wallet.balanceMinor / quote.grossMinor).toString()} paid leads</dd>
              </div>
            ) : null}
          </dl>
          {overview.pendingFunds > 0 ? (
            <Alert tone="warning" title={`${overview.pendingFunds} qualified lead${overview.pendingFunds === 1 ? ' is' : 's are'} waiting for funds`}>
              Booked patients still reach you through their appointments. Callback requests are delivered — with the patient’s contact details — once the wallet covers them.{' '}
              <Link href="/account/practice/leads?billing=PENDING_FUNDS">See leads</Link>
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card label="How leads are billed">
        <CardHeader>
          <strong>How qualified leads are billed</strong>
        </CardHeader>
        <CardBody>
          {quote && free ? (
            <dl className="tl-kv">
              <div>
                <dt>Free leads</dt>
                <dd>
                  Your first {free.allowance} qualified leads are free · {free.decided >= free.allowance ? 'all used' : `${free.remaining} left`}
                </dd>
              </div>
              <div>
                <dt>Each paid lead after that</dt>
                <dd>
                  {money(quote.netMinor)} + GST {rate}% ({money(quote.taxMinor)}) = <strong>{money(quote.grossMinor)}</strong>
                </dd>
              </div>
              <div>
                <dt>Never charged</dt>
                <dd>Duplicates, unverified or internal requests, and bookings you decline</dd>
              </div>
            </dl>
          ) : (
            <Alert tone="danger" title="Lead pricing is not configured">
              {overview.pricingError}
            </Alert>
          )}
        </CardBody>
      </Card>

      {recharge ? (
        <Card label="Recharge">
          <CardHeader>
            <strong>Recharge</strong>
          </CardHeader>
          <CardBody>
            <p style={{ marginTop: 0 }}>
              The minimum recharge is {recharge.minimumLeads} paid leads: {money(recharge.netMinor)} + GST {money(recharge.taxMinor)} ={' '}
              <strong>{money(recharge.totalMinor)} payable</strong>.
            </p>
            <Table caption="What a recharge covers">
              <thead>
                <tr>
                  <th scope="col">Paid leads</th>
                  <th scope="col">Lead value</th>
                  <th scope="col">GST {rate}%</th>
                  <th scope="col">Total payable</th>
                </tr>
              </thead>
              <tbody>
                {[recharge.minimumLeads, recharge.minimumLeads * 2.5, recharge.minimumLeads * 5].map((n) => {
                  const count = BigInt(Math.round(n));
                  return (
                    <tr key={n}>
                      <td>{count.toString()}</td>
                      <td>{money(recharge.perLead.netMinor * count)}</td>
                      <td>{money(recharge.perLead.taxMinor * count)}</td>
                      <td>{money(recharge.perLead.grossMinor * count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {overview.topUpAvailable ? null : (
              <Alert tone="info" title="Adding funds">
                Online recharge is not available yet: no payment provider is connected. To recharge, make a bank transfer to Toothlogy quoting “{organization.name}”; our team records it here with the transfer reference, and any leads waiting for funds are charged straight after.
              </Alert>
            )}
          </CardBody>
        </Card>
      ) : null}

      <BillingActions
        organizationId={id}
        topUpAvailable={overview.topUpAvailable}
        minimumTopUpMinor={recharge ? recharge.minimumTotalMinor.toString() : null}
        currency={wallet.currency}
      />

      <Card label="Statement of account">
        <CardHeader>
          <strong>Statement of account</strong>
        </CardHeader>
        <CardBody>
          <form method="get" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="tl-field">
              <span className="tl-field__label">From</span>
              <input className="tl-input" type="date" name="from" defaultValue={from} max={todayLocal} />
            </label>
            <label className="tl-field">
              <span className="tl-field__label">To</span>
              <input className="tl-input" type="date" name="to" defaultValue={to} max={todayLocal} />
            </label>
            <button className="tl-button tl-button--secondary tl-button--md" type="submit">
              <span>Show statement</span>
            </button>
          </form>
          <p className="tl-muted">{STATEMENT_NOTICE}</p>
          {statementError ? (
            <Alert tone="danger" title="Could not produce that statement">
              {statementError}
            </Alert>
          ) : statement ? (
            <div className="tl-stack">
              <dl className="tl-kv">
                <div>
                  <dt>Opening balance ({statement.from})</dt>
                  <dd>{money(statement.openingBalanceMinor)}</dd>
                </div>
                <div>
                  <dt>Recharges and credits ({statement.creditCount})</dt>
                  <dd>+{money(statement.creditsMinor)}</dd>
                </div>
                <div>
                  <dt>Paid leads ({statement.leadCharges.count})</dt>
                  <dd>
                    −{money(statement.leadCharges.grossMinor)} ({money(statement.leadCharges.netMinor)} + GST {money(statement.leadCharges.taxMinor)})
                  </dd>
                </div>
                <div>
                  <dt>Refunds ({statement.refunds.count})</dt>
                  <dd>+{money(statement.refunds.amountMinor)}</dd>
                </div>
                <div>
                  <dt>Reversals ({statement.reversals.count})</dt>
                  <dd>{statement.reversals.amountMinor < ZERO ? `−${money(-statement.reversals.amountMinor)}` : `+${money(statement.reversals.amountMinor)}`}</dd>
                </div>
                <div>
                  <dt>Closing balance ({statement.to})</dt>
                  <dd>
                    <strong>{money(statement.closingBalanceMinor)}</strong>
                  </dd>
                </div>
                <div>
                  <dt>GST on leads</dt>
                  <dd>
                    {money(statement.gst.chargedMinor)} charged − {money(statement.gst.refundedMinor)} refunded = {money(statement.gst.netMinor)}
                  </dd>
                </div>
                <div>
                  <dt>Qualified leads billed</dt>
                  <dd>
                    {statement.leads.billed} · {statement.leads.free} free · {statement.leads.paid} paid · {statement.leads.pendingFunds} waiting for funds
                  </dd>
                </div>
              </dl>
              {!statement.reconciles ? (
                <Alert tone="danger" title="This statement does not reconcile">
                  Please contact Toothlogy support; the figures above are shown exactly as recorded.
                </Alert>
              ) : null}
              {statement.lines.length > 0 ? (
                <Table caption={`Ledger entries from ${statement.from} to ${statement.to}`}>
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">What</th>
                      <th scope="col">Amount</th>
                      <th scope="col">GST</th>
                      <th scope="col">Balance</th>
                      <th scope="col">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{when(l.at)}</td>
                        <td>{KIND_LABELS[l.kind] ?? l.kind}</td>
                        <td>{l.amountMinor < ZERO ? `−${money(-l.amountMinor)}` : `+${money(l.amountMinor)}`}</td>
                        <td>{l.kind === 'LEAD_CHARGE' || l.kind === 'REFUND' ? money(abs(l.taxMinor)) : '—'}</td>
                        <td>{money(l.balanceAfterMinor)}</td>
                        <td>{l.reference ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="tl-muted" style={{ margin: 0 }}>
                  No movements in this period.
                </p>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card label="Ledger">
        <CardHeader>
          <strong>Latest ledger entries</strong>
        </CardHeader>
        <CardBody>
          {overview.entries.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              No entries yet.
            </p>
          ) : (
            <Table caption="Wallet ledger, newest first">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Balance after</th>
                  <th scope="col">Reference</th>
                </tr>
              </thead>
              <tbody>
                {overview.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{when(e.createdAt)}</td>
                    <td>
                      {KIND_LABELS[e.kind] ?? e.kind}
                      {e.kind === 'LEAD_CHARGE' && e.taxMinor !== null ? <span className="tl-list__meta"> incl. GST {money(abs(e.taxMinor))}</span> : null}
                    </td>
                    <td>{e.amountMinor < ZERO ? `−${money(-e.amountMinor)}` : `+${money(e.amountMinor)}`}</td>
                    <td>{money(e.balanceAfterMinor)}</td>
                    <td>{e.externalReference ?? e.memo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card label="Issued monthly statements">
        <CardHeader>
          <strong>Issued monthly statements</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ marginTop: 0 }}>
            Statements of account, not GST tax invoices.
          </p>
          {overview.invoices.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              None issued yet.
            </p>
          ) : (
            <ul className="tl-list">
              {overview.invoices.map((i) => (
                <li key={i.id}>
                  <strong>{i.number}</strong>
                  <span className="tl-list__meta">
                    {month(i.periodStart)} · {money(i.subtotalMinor)} + GST {money(i.taxMinor)} = {money(i.totalMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {overview.disputes.length > 0 ? (
        <Card label="Disputes">
          <CardHeader>
            <strong>Disputes</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {overview.disputes.map((d) => (
                <li key={d.id}>
                  <div className="tl-card__title-row">
                    <span>{d.reason.replace(/_/g, ' ').toLowerCase()}</span>
                    <Badge tone={d.status === 'ACCEPTED' ? 'success' : d.status === 'REJECTED' ? 'danger' : 'warning'}>{d.status.toLowerCase()}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    Raised {when(d.createdAt)}
                    {d.resolutionNote ? ` · ${d.resolutionNote}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
