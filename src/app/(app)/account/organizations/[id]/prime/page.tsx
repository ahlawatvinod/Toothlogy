/**
 * TL-PAGE-ORG-PRIME-001 — /account/organizations/:id/prime
 *
 * An organization's Prime membership: the current period and what it is
 * using (bonus free leads, badge, priority support), renewal on or off, the
 * plans on sale with price and tax, and past periods. Paid from the lead
 * wallet. For those with tl.prime.membership.manage; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { primeConsole } from '@/platform/prime/service';
import { formatRate } from '@/platform/tax/packs';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { AutoRenewToggle, BuyPlanButton } from '@/components/prime/prime-forms';

export const metadata: Metadata = { title: 'Prime membership', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PrimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await primeConsole(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, current, history, offers } = data;
  const money = (n: bigint, currency: string) => formatMoney({ amountMinor: n, currency }, 'en-IN');
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const period = (months: number) => (months === 1 ? 'a month' : months === 12 ? 'a year' : `${months} months`);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Prime</span>
      </nav>
      <header className="tl-page__header">
        <h1>Prime membership</h1>
        <p className="tl-page__lead">
          Paid from your lead wallet{organization.wallet ? `, which holds ${money(organization.wallet.balanceMinor, organization.wallet.currency)}` : ''}. <Link href={`/account/organizations/${id}/billing`}>Wallet and statements</Link>. Prime never changes where you rank in search.
        </p>
      </header>

      {current ? (
        <Card label="Your membership">
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>{current.membership.plan.name}</strong>
              <Badge tone="success">Prime member</Badge>
            </div>
          </CardHeader>
          <CardBody>
            <div className="tl-stack">
              <span>
                Until {day(current.membership.endsAt)} · {current.membership.autoRenew ? 'renews automatically from the lead wallet' : 'will not renew'}
              </span>
              <ul className="tl-list" aria-label="Benefits">
                {current.bonusFreeLeads > 0 ? (
                  <li>
                    Bonus free leads this period: {current.bonusUsed} of {current.bonusFreeLeads} used
                  </li>
                ) : null}
                {current.primeBadge ? <li>“Prime member” badge on your public page</li> : null}
                {current.prioritySupport ? <li>Priority support: your help requests are answered first</li> : null}
              </ul>
              <AutoRenewToggle membershipId={current.membership.id} autoRenew={current.membership.autoRenew} endsOn={day(current.membership.endsAt)} />
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card label="Plans">
          <CardHeader>
            <strong>Plans</strong>
          </CardHeader>
          <CardBody>
            {offers.length === 0 ? (
              <EmptyState title="No Prime plans on sale" description="Toothlogy has not put a Prime plan on sale in your country yet." />
            ) : (
              <ul className="tl-list" aria-label="Prime plans">
                {offers.map(({ plan, price }) => (
                  <li key={plan.id}>
                    <Card label={plan.name}>
                      <CardBody>
                        <div className="tl-stack">
                          <strong>{plan.name}</strong>
                          <span>
                            {money(price.grossMinor, plan.currency)} for {period(plan.periodMonths)} ({money(price.netMinor, plan.currency)} + {formatRate(price.rateBasisPoints)} GST {money(price.taxMinor, plan.currency)})
                          </span>
                          {plan.description ? <p style={{ margin: 0 }}>{plan.description}</p> : null}
                          <ul className="tl-list">
                            {plan.bonusFreeLeads > 0 ? <li>{plan.bonusFreeLeads} bonus free leads each period, after your standard free leads</li> : null}
                            {plan.primeBadge ? <li>“Prime member” badge on your public page — labelled, and never a ranking boost</li> : null}
                            {plan.prioritySupport ? <li>Priority support</li> : null}
                          </ul>
                          <BuyPlanButton organizationId={id} planId={plan.id} planName={plan.name} price={money(price.grossMinor, plan.currency)} />
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
            <p className="tl-muted">A period is charged when it starts. Turning renewal off keeps Prime to the end of the period; part-used periods are not refunded.</p>
          </CardBody>
        </Card>
      )}

      {history.length > 0 ? (
        <Card label="Periods">
          <CardHeader>
            <strong>Periods</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list" aria-label="Membership periods">
              {history.map((m) => (
                <li key={m.id} className="tl-list__meta">
                  {m.plan.name} · {day(m.startsAt)} to {day(m.endsAt)} · {money(m.netMinor + m.taxMinor, m.currency)} · {m.status === 'ACTIVE' ? 'current' : `ended${m.endedReason ? ` (${m.endedReason.toLowerCase()})` : ''}`}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
