/**
 * TL-PAGE-ORG-CAMPAIGN-001 — /account/organizations/:id/campaigns/:campaignId
 *
 * One Prime campaign: status and actions, money (budget, held, spent,
 * refunded, remaining, daily rate), sponsored results next to — never mixed
 * with — the organization's organic leads, each day charged, and the audit
 * trail. Managers of the organization and Toothlogy staff only.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getCampaign, organicComparison } from '@/platform/sponsored/service';
import { isAppError } from '@/platform/kernel/errors';
import { formatMoney } from '@/platform/money';
import { TREATMENTS } from '@/platform/catalogue/treatments';
import { Badge, Card, CardBody, CardHeader, Table } from '@/design-system';
import { SponsoredCard } from '@/components/sponsored/sponsored-card';
import { STATUS_TONE } from '../page';
import { CampaignActions } from './campaign-actions';

export const metadata: Metadata = { title: 'Prime campaign', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = { CLINIC: 'Clinic visits', VIDEO: 'Video consultations', HOME_VISIT: 'Home visits' };

export default async function CampaignPage({ params }: { params: Promise<{ id: string; campaignId: string }> }) {
  const { id, campaignId } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/organizations/${id}/campaigns/${campaignId}`);

  let detail;
  try {
    detail = await getCampaign(principal, campaignId);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const { campaign, tier, targetRadiusKm, audit, analytics } = detail;
  if (campaign.organizationId !== id) notFound();
  const organic = await organicComparison(campaign);
  const money = (minor: bigint) => formatMoney({ amountMinor: minor, currency: campaign.currency }, 'en-IN');
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: campaign.timezone }).format(d);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: campaign.timezone }).format(d);
  const subjectName = campaign.subjectType === 'PRACTICE' ? (campaign.practice?.dentistProfile.user.displayName ?? 'Dentist') : campaign.organization.name;
  const treatmentName = new Map(TREATMENTS.map((t) => [t.key, t.name]));

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}/campaigns`}>Prime campaigns</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{campaign.name}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{campaign.name}</h1>
          <Badge tone={STATUS_TONE[campaign.status] ?? 'neutral'}>{campaign.status.toLowerCase()}</Badge>
        </div>
        <p className="tl-page__lead">
          {tier}: {subjectName} · {day(campaign.startsAt)} – {day(new Date(campaign.endsAt.getTime() - 1))}
          {campaign.closeReason ? ` · ${campaign.closeReason}` : ''}
        </p>
      </header>

      <CampaignActions
        campaignId={campaign.id}
        status={campaign.status}
        currency={campaign.currency}
        budgetMinor={campaign.budgetMinor.toString()}
        treatments={TREATMENTS.map((t) => ({ key: t.key, name: t.name }))}
        targetTreatmentKeys={campaign.targetTreatmentKeys}
        targetAppointmentTypes={campaign.targetAppointmentTypes}
        targetRadiusKm={targetRadiusKm}
      />

      <Card label="Money">
        <CardHeader>
          <strong>Budget and spend</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Budget</dt>
              <dd>{money(campaign.budgetMinor)} (GST included)</dd>
            </div>
            <div>
              <dt>Held from the wallet</dt>
              <dd>{money(campaign.heldMinor)}</dd>
            </div>
            <div>
              <dt>Spent</dt>
              <dd>
                {money(analytics.spentMinor)} over {campaign.days.length} day{campaign.days.length === 1 ? '' : 's'}
              </dd>
            </div>
            <div>
              <dt>Remaining</dt>
              <dd>{money(analytics.remainingMinor)}</dd>
            </div>
            <div>
              <dt>Refunded to the wallet</dt>
              <dd>{money(campaign.refundedMinor)}</dd>
            </div>
            <div>
              <dt>Daily rate</dt>
              <dd>{campaign.dailyRateMinor > BigInt(0) ? `${money(campaign.dailyRateMinor)} a running day` : '—'}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card label="Results">
        <CardHeader>
          <strong>Results</strong>
        </CardHeader>
        <CardBody>
          <Table caption="Sponsored results beside organic leads — never added together">
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Sponsored (this campaign)</th>
                <th scope="col">Organic (same dates)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Impressions</td>
                <td>{analytics.impressions}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Clicks (click-through)</td>
                <td>
                  {analytics.clicks}
                  {analytics.clickThroughRate !== null ? ` (${analytics.clickThroughRate}%)` : ''}
                </td>
                <td>—</td>
              </tr>
              <tr>
                <td>Profile views</td>
                <td>{analytics.profileViews}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Booking clicks</td>
                <td>{analytics.bookingClicks}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Leads</td>
                <td>{analytics.leads}</td>
                <td>{organic.leads}</td>
              </tr>
              <tr>
                <td>Conversions</td>
                <td>{analytics.conversions}</td>
                <td>{organic.conversions}</td>
              </tr>
              <tr>
                <td>Cost per lead</td>
                <td>{analytics.costPerLeadMinor !== null ? money(analytics.costPerLeadMinor) : '—'}</td>
                <td>—</td>
              </tr>
            </tbody>
          </Table>
          <p className="tl-muted">
            Views and clicks by your own team are recorded but not counted ({analytics.excludedEvents} excluded). Organic search does not record
            impressions, so only leads and conversions are compared.
          </p>
        </CardBody>
      </Card>

      <Card label="Targeting and preview">
        <CardHeader>
          <strong>Targeting and preview</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Placements</dt>
              <dd>{[campaign.searchPlacement ? 'Search' : null, campaign.profilePlacement ? 'Profiles' : null].filter(Boolean).join(' and ')}</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{targetRadiusKm ? `Searches within ${targetRadiusKm} km of the branch` : 'Anywhere'}</dd>
            </div>
            <div>
              <dt>Treatments</dt>
              <dd>{campaign.targetTreatmentKeys.length > 0 ? campaign.targetTreatmentKeys.map((k) => treatmentName.get(k) ?? k).join(', ') : 'Any search'}</dd>
            </div>
            <div>
              <dt>Appointment types</dt>
              <dd>{campaign.targetAppointmentTypes.length > 0 ? campaign.targetAppointmentTypes.map((t) => TYPE_LABELS[t] ?? t).join(', ') : 'Any'}</dd>
            </div>
          </dl>
          <SponsoredCard slot={{ tier, title: subjectName, subtitle: campaign.organization.name, href: '#', next: null }} preview />
        </CardBody>
      </Card>

      <Card label="Days charged">
        <CardHeader>
          <strong>Days charged</strong>
        </CardHeader>
        <CardBody>
          {campaign.days.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              No day charged yet.
            </p>
          ) : (
            <ul className="tl-list">
              {campaign.days.map((d) => (
                <li key={d.id}>
                  {d.localDate} · {money(d.amountMinor)} <span className="tl-list__meta">(GST {money(d.taxMinor)})</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card label="History">
        <CardHeader>
          <strong>History</strong>
        </CardHeader>
        <CardBody>
          <ol className="tl-list">
            {audit.map((a) => (
              <li key={a.id}>
                <strong>{a.action.replace('CAMPAIGN_', '').replace(/_/g, ' ').toLowerCase()}</strong>
                <span className="tl-list__meta">
                  {when(a.occurredAt)} · {a.actor}
                </span>
              </li>
            ))}
          </ol>
        </CardBody>
      </Card>
    </div>
  );
}
