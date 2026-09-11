/**
 * TL-PAGE-ORG-EQUIPMENT-001 — /account/organizations/:id/equipment
 *
 * A practice's equipment register with warranties, its maintenance contracts
 * (accept choosing what is covered, decline, cancel) and service visits
 * (request, cancel). Readable with tl.equipment.asset.read; changes need
 * tl.equipment.asset.manage. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { CONTRACT_STATUS_LABEL, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, VISIT_STATUS_LABEL, equipmentConsole } from '@/platform/equipment/service';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { AddAssetForm, AssetStatusButton, ContractDecision, ReasonAction, VisitRequestForm } from '@/components/equipment/equipment-forms';

export const metadata: Metadata = { title: 'Equipment', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

export default async function EquipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await equipmentConsole(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, assets, contracts, deliveredLines, canManage } = data;
  const now = new Date();
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
  const inUse = assets.filter((a) => a.status === 'IN_USE');
  const label = (key: string) => EQUIPMENT_CATEGORY_LABEL[key as keyof typeof EQUIPMENT_CATEGORY_LABEL] ?? key;

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Equipment</span>
      </nav>
      <header className="tl-page__header">
        <h1>Equipment</h1>
        <p className="tl-page__lead">Your equipment, its warranties, and maintenance contracts with service businesses. You are reminded 30 days before a warranty or contract ends.</p>
      </header>

      <Card label="Equipment register">
        <CardHeader>
          <strong>Equipment register</strong>
        </CardHeader>
        <CardBody>
          {assets.length === 0 ? (
            <EmptyState title="Nothing registered yet" description={canManage ? 'Add your chairs, X-ray units, autoclaves and other equipment below.' : 'Your administrators add equipment here.'} />
          ) : (
            <ul className="tl-list" aria-label="Equipment">
              {assets.map((a) => {
                const warranty = a.warrantyUntil ? Math.ceil((a.warrantyUntil.getTime() - now.getTime()) / DAY) : null;
                return (
                  <li key={a.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{a.name}</strong>
                      {a.status === 'RETIRED' ? <Badge tone="neutral">retired</Badge> : null}
                      {warranty !== null && warranty >= 0 && warranty <= 30 ? <Badge tone="warning">warranty ends in {warranty} days</Badge> : null}
                    </div>
                    <span className="tl-list__meta">
                      {[label(a.category), [a.brand, a.model].filter(Boolean).join(' '), a.serialNumber ? `serial ${a.serialNumber}` : null, a.supplier ? `from ${a.supplier.name}` : null, a.purchasedOn ? `bought ${day(a.purchasedOn)}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="tl-list__meta">
                      {a.warrantyUntil ? (warranty !== null && warranty < 0 ? `Warranty ended ${day(a.warrantyUntil)}` : `Warranty until ${day(a.warrantyUntil)}`) : 'No warranty recorded'}
                      {a.contracts.length > 0 ? ` · covered by ${a.contracts.map((c) => `${c.contract.kind} with ${c.contract.provider.name} to ${day(c.contract.endsOn)}`).join(', ')}` : ''}
                    </span>
                    {canManage ? <AssetStatusButton assetId={a.id} retired={a.status === 'RETIRED'} name={a.name} /> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {canManage ? (
        <Card label="Add equipment">
          <CardHeader>
            <strong>Add equipment</strong>
          </CardHeader>
          <CardBody>
            <AddAssetForm
              organizationId={id}
              categories={EQUIPMENT_CATEGORIES.map((key) => ({ key, label: EQUIPMENT_CATEGORY_LABEL[key] }))}
              deliveredLines={deliveredLines.map((l) => ({ id: l.id, name: l.name, label: `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ''} — order ${l.order.number} from ${l.order.seller.name}` }))}
            />
          </CardBody>
        </Card>
      ) : null}

      <Card label="Maintenance contracts">
        <CardHeader>
          <strong>Maintenance contracts</strong>
        </CardHeader>
        <CardBody>
          {contracts.length === 0 ? (
            <EmptyState title="No contracts" description="A service business you have ordered from or asked for a quote can propose an AMC or CMC here." />
          ) : (
            <ul className="tl-list" aria-label="Contracts">
              {contracts.map((c) => {
                const used = c.visits.filter((v) => v.kind === 'PREVENTIVE' && v.status !== 'CANCELLED').length;
                return (
                  <li key={c.id}>
                    <Card label={`${c.kind} with ${c.provider.name}`}>
                      <CardBody>
                        <div className="tl-stack">
                          <div className="tl-card__title-row">
                            <strong>
                              {c.kind} with {c.provider.name}
                            </strong>
                            <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'PROPOSED' ? 'warning' : 'neutral'}>{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                          </div>
                          <span className="tl-list__meta">
                            {day(c.startsOn)} to {day(c.endsOn)} · {formatMoney({ amountMinor: c.priceMinor, currency: c.currency }, 'en-IN')} · preventive visits {used} of {c.visitsIncluded} used
                            {c.responseHours ? ` · breakdown response within ${c.responseHours} hours (as the business states)` : ''}
                          </span>
                          {c.terms ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.terms}</p> : null}
                          {c.assets.length > 0 ? <span className="tl-list__meta">Covers {c.assets.map((a) => a.asset.name).join(', ')}</span> : null}
                          {c.cancelReason ? <span className="tl-list__meta">Reason: {c.cancelReason}</span> : null}
                          <span className="tl-list__meta">{[c.provider.phone, c.provider.email].filter(Boolean).join(' · ')}</span>
                          {c.visits.length > 0 ? (
                            <ul className="tl-list" aria-label="Visits">
                              {c.visits.map((v) => (
                                <li key={v.id} className="tl-stack">
                                  <span>
                                    {v.kind === 'BREAKDOWN' ? 'Breakdown call' : 'Preventive visit'}
                                    {v.asset ? ` for ${v.asset.name}` : ''} · {VISIT_STATUS_LABEL[v.status]}
                                    {v.scheduledFor && v.status === 'SCHEDULED' ? ` for ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(v.scheduledFor)}` : ''}
                                  </span>
                                  {v.issue ? <span className="tl-list__meta">Problem: {v.issue}</span> : null}
                                  {v.report ? <span className="tl-list__meta">Work done: {v.report}</span> : null}
                                  {canManage && (v.status === 'REQUESTED' || v.status === 'SCHEDULED') ? (
                                    <ReasonAction label="Why you are cancelling the visit" button="Cancel visit" path={`/api/v1/service-visits/${v.id}/actions`} body={{ action: 'CANCEL' }} done="Visit cancelled. The business has been told." />
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {canManage && c.status === 'PROPOSED' ? <ContractDecision contractId={c.id} assets={inUse.map((a) => ({ id: a.id, name: a.name }))} /> : null}
                          {canManage && c.status === 'ACTIVE' ? <VisitRequestForm contractId={c.id} assets={c.assets.map((a) => ({ id: a.asset.id, name: a.asset.name }))} /> : null}
                          {canManage && c.status === 'ACTIVE' ? (
                            <ReasonAction label="Why you are cancelling the contract" button="Cancel contract" path={`/api/v1/service-contracts/${c.id}/actions`} body={{ action: 'CANCEL' }} done="Contract cancelled. The business has been told." />
                          ) : null}
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
