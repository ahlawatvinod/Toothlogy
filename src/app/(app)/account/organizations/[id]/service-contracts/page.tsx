/**
 * TL-PAGE-ORG-SERVICE-CONTRACTS-001 — /account/organizations/:id/service-contracts
 *
 * A service business's maintenance contracts: propose an AMC or CMC to a
 * practice it has traded with, schedule and complete visits, cancel. For
 * those with tl.equipment.contract.manage on the business; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { CONTRACT_STATUS_LABEL, VISIT_STATUS_LABEL, providerContracts } from '@/platform/equipment/service';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { ProposeContractForm, ReasonAction, VisitProviderActions } from '@/components/equipment/equipment-forms';

export const metadata: Metadata = { title: 'Service contracts', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ServiceContractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await providerContracts(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, contracts, partners, canPropose } = data;
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Service contracts</span>
      </nav>
      <header className="tl-page__header">
        <h1>Service contracts</h1>
        <p className="tl-page__lead">Annual and comprehensive maintenance contracts with practices. Payment is arranged between you and the practice.</p>
      </header>

      {canPropose ? (
        <Card label="Propose a contract">
          <CardHeader>
            <strong>Propose a contract</strong>
          </CardHeader>
          <CardBody>
            {partners.length === 0 ? (
              <EmptyState title="No practices yet" description="Practices appear here once they order from you, ask you for a quote, or list you as the supplier of their equipment." />
            ) : (
              <ProposeContractForm organizationId={id} partners={partners} today={new Date().toISOString().slice(0, 10)} />
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card label="Contracts">
        <CardHeader>
          <strong>Contracts</strong>
        </CardHeader>
        <CardBody>
          {contracts.length === 0 ? (
            <EmptyState title="No contracts yet" description="Contracts you propose appear here with their visits." />
          ) : (
            <ul className="tl-list" aria-label="Contracts">
              {contracts.map((c) => (
                <li key={c.id}>
                  <Card label={`${c.kind} for ${c.client.name}`}>
                    <CardBody>
                      <div className="tl-stack">
                        <div className="tl-card__title-row">
                          <strong>
                            {c.kind} for {c.client.name}
                          </strong>
                          <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'PROPOSED' ? 'warning' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                        </div>
                        <span className="tl-list__meta">
                          {day(c.startsOn)} to {day(c.endsOn)} · {formatMoney({ amountMinor: c.priceMinor, currency: c.currency }, 'en-IN')} · {c.visitsIncluded} preventive visits
                          {c.responseHours ? ` · response within ${c.responseHours} hours` : ''}
                        </span>
                        {c.assets.length > 0 ? (
                          <span className="tl-list__meta">
                            Covers {c.assets.map((a) => [a.asset.name, a.asset.model, a.asset.serialNumber ? `serial ${a.asset.serialNumber}` : null].filter(Boolean).join(' ')).join('; ')}
                          </span>
                        ) : null}
                        {c.cancelReason ? <span className="tl-list__meta">Reason: {c.cancelReason}</span> : null}
                        {c.status === 'ACTIVE' ? <span className="tl-list__meta">{[c.client.phone, c.client.email].filter(Boolean).join(' · ')}</span> : null}
                        {c.visits.length > 0 ? (
                          <ul className="tl-list" aria-label="Visits">
                            {c.visits.map((v) => (
                              <li key={v.id} className="tl-stack">
                                <span>
                                  {v.kind === 'BREAKDOWN' ? 'Breakdown call' : 'Preventive visit'}
                                  {v.asset ? ` for ${v.asset.name}` : ''} · {VISIT_STATUS_LABEL[v.status]}
                                </span>
                                {v.issue ? <span className="tl-list__meta">Problem: {v.issue}</span> : null}
                                {v.report ? <span className="tl-list__meta">Work done: {v.report}</span> : null}
                                {v.status === 'REQUESTED' || v.status === 'SCHEDULED' ? <VisitProviderActions visitId={v.id} /> : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {c.status === 'PROPOSED' || c.status === 'ACTIVE' ? (
                          <ReasonAction label="Why you are cancelling" button={c.status === 'PROPOSED' ? 'Withdraw proposal' : 'Cancel contract'} path={`/api/v1/service-contracts/${c.id}/actions`} body={{ action: 'CANCEL' }} done="Cancelled. The practice has been told." />
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
