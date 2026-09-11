/**
 * TL-PAGE-ADMIN-PRIME-001 — /admin/prime
 *
 * Prime plans for Toothlogy staff: create a draft (audience, country, price
 * per period before tax, period, benefits), put it on sale once its tax is
 * configured, retire it. No plan is built in: the price and benefits are a
 * business decision made here. 404 without tl.prime.plan.manage.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPlans, PLAN_STATUS_LABEL } from '@/platform/prime/service';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { PlanActions, PlanForm } from '@/components/prime/prime-forms';

export const metadata: Metadata = { title: 'Prime plans (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AdminPrimePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/prime');
  if (!can(principal, 'tl.prime.plan.manage')) notFound();
  const [plans, countries] = await Promise.all([listPlans(principal), db().country.findMany({ where: { enabled: true }, select: { code: true, name: true }, orderBy: { name: 'asc' } })]);
  const money = (n: bigint, currency: string) => formatMoney({ amountMinor: n, currency }, 'en-IN');

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Prime plans</h1>
        <p className="tl-page__lead">Plans practices buy from their lead wallet. A plan on sale is never edited — retire it and create another, so members keep the terms they bought.</p>
      </header>
      <Card label="Plans">
        <CardHeader>
          <strong>Plans</strong>
        </CardHeader>
        <CardBody>
          {plans.length === 0 ? (
            <EmptyState title="No plans yet" description="Create the first plan below. It stays a draft until you put it on sale." />
          ) : (
            <ul className="tl-list" aria-label="Plans">
              {plans.map((p) => (
                <li key={p.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>{p.name}</strong>
                    <Badge tone={p.status === 'ACTIVE' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'neutral'}>{PLAN_STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {p.code} · {p.audience === 'ORGANIZATION' ? 'practices and businesses' : 'individuals'} · {p.countryCode} · {money(p.priceMinor, p.currency)} before tax
                    {p.price ? ` (${money(p.price.grossMinor, p.currency)} with tax)` : ' (tax not configured)'} every {p.periodMonths} {p.periodMonths === 1 ? 'month' : 'months'}
                    {p.bonusFreeLeads > 0 ? ` · ${p.bonusFreeLeads} bonus leads` : ''}
                    {p.primeBadge ? ' · badge' : ''}
                    {p.prioritySupport ? ' · priority support' : ''} · {p._count.memberships} current members
                  </span>
                  <PlanActions planId={p.id} status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card label="Create a plan">
        <CardHeader>
          <strong>Create a plan</strong>
        </CardHeader>
        <CardBody>
          <PlanForm countries={countries} />
        </CardBody>
      </Card>
    </div>
  );
}
