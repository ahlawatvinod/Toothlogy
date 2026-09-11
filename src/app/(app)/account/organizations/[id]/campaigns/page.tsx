/**
 * TL-PAGE-ORG-CAMPAIGNS-001 — /account/organizations/:id/campaigns
 *
 * Prime for a clinic or hospital: what can be promoted, the campaigns so far,
 * and a form to create one (a draft — nothing is shown and nothing is held
 * until it is activated). Managers of this organization and Toothlogy staff
 * only; anyone else gets 404.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { canManageCampaigns, listCampaigns, placementSettings, primeTier } from '@/platform/sponsored/service';
import { requireTaxRate } from '@/platform/tax';
import { formatMoney } from '@/platform/money';
import { TREATMENTS } from '@/platform/catalogue/treatments';
import { localDateOf } from '@/lib/zoned-time';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { CampaignForm, type CampaignSubjectOption } from './campaign-form';

export const metadata: Metadata = { title: 'Prime campaigns', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ENDED: 'neutral',
  EXHAUSTED: 'info',
  CANCELLED: 'danger',
};

export default async function CampaignsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/account/organizations/${id}/campaigns`);
  if (!canManageCampaigns(principal, id)) notFound();

  const organization = await db().organization.findUnique({
    where: { id },
    select: { name: true, type: true, timezone: true, countryCode: true, currency: true, verifiedAt: true, verificationExpires: true, deletedAt: true },
  });
  if (!organization || organization.deletedAt) notFound();

  const [campaigns, practices, wallet, settings] = await Promise.all([
    listCampaigns(principal, id),
    db().dentistPractice.findMany({
      where: { isConfirmed: true, location: { organizationId: id, deletedAt: null, status: 'ACTIVE' }, dentistProfile: { isDiscoverable: true, deletedAt: null } },
      select: { id: true, dentistProfile: { select: { headline: true, user: { select: { displayName: true } } } }, location: { select: { name: true, latitude: true } } },
    }),
    db().wallet.findUnique({ where: { organizationId: id } }),
    placementSettings(organization.countryCode).catch(() => null),
  ]);
  const taxRate = settings ? await requireTaxRate(organization.countryCode, settings.taxCategory as 'platform_fees').catch(() => null) : null;
  const money = (minor: bigint) => formatMoney({ amountMinor: minor, currency: organization.currency }, 'en-IN');
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: organization.timezone }).format(d);
  const verified = organization.verifiedAt !== null && (organization.verificationExpires === null || organization.verificationExpires > new Date());

  const subjects: CampaignSubjectOption[] = [
    ...(verified && (organization.type === 'CLINIC' || organization.type === 'HOSPITAL')
      ? [{ value: 'ORGANIZATION', tier: primeTier('ORGANIZATION', organization.type), title: organization.name, subtitle: organization.name, hasLocation: true }]
      : []),
    ...practices.map((p) => ({
      value: p.id,
      tier: primeTier('PRACTICE', organization.type),
      title: p.dentistProfile.user.displayName ?? 'Dentist',
      subtitle: [p.dentistProfile.headline, `${organization.name}, ${p.location.name}`].filter(Boolean).join(' · '),
      hasLocation: p.location.latitude !== null,
    })),
  ];

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Prime campaigns</span>
      </nav>
      <header className="tl-page__header">
        <h1>Prime campaigns</h1>
        <p className="tl-page__lead">
          Prime puts a dentist, clinic or hospital in a clearly labelled <strong>Sponsored</strong> slot on search pages and on other profiles nearby. It never
          changes where anyone appears in the organic results, and it is shown only while the promoted practice has a free time to book.
        </p>
      </header>

      <Card label="How Prime is paid">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Wallet</dt>
              <dd>
                {money(wallet?.balanceMinor ?? BigInt(0))} · <Link href={`/account/organizations/${id}/billing`}>Recharge and statements</Link>
              </dd>
            </div>
            {settings ? (
              <div>
                <dt>Minimum budget</dt>
                <dd>{money(settings.minimumDailyBudgetMinor)} a day, GST included</dd>
              </div>
            ) : null}
            <div>
              <dt>Billing</dt>
              <dd>The budget is held from the wallet when you activate; each day the campaign runs costs its share; whatever is not spent comes back when it ends or you cancel.</dd>
            </div>
          </dl>
          <p className="tl-muted" style={{ margin: 0 }}>
            Clicks are counted, not charged — clicks by your own team are not even counted. Leads from a Prime click are billed like any other lead.
          </p>
        </CardBody>
      </Card>

      <Card label="Campaigns">
        <CardHeader>
          <strong>Campaigns</strong>
        </CardHeader>
        <CardBody>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create one below. It stays a draft until you activate it." />
          ) : (
            <Table caption="This organization’s Prime campaigns">
              <thead>
                <tr>
                  <th scope="col">Campaign</th>
                  <th scope="col">Promotes</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Budget</th>
                  <th scope="col">Spent</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/account/organizations/${id}/campaigns/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>
                      {primeTier(c.subjectType, c.organization.type)}: {c.subjectType === 'PRACTICE' ? (c.practice?.dentistProfile.user.displayName ?? 'Dentist') : c.organization.name}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status.toLowerCase()}</Badge>
                    </td>
                    <td>
                      {when(c.startsAt)} – {when(new Date(c.endsAt.getTime() - 1))}
                    </td>
                    <td>{money(c.budgetMinor)}</td>
                    <td>{money(c.spentMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {!settings || !taxRate ? (
        <Alert tone="danger" title="Prime is not configured for this country">
          Sponsored placement settings or tax for {organization.countryCode} are missing, so no campaign can be created here.
        </Alert>
      ) : subjects.length === 0 ? (
        <Alert tone="info" title="Nothing to promote yet">
          A campaign needs a verified, listed dentist confirmed at one of your branches, or a verified clinic or hospital.
        </Alert>
      ) : (
        <CampaignForm
          organizationId={id}
          subjects={subjects}
          treatments={TREATMENTS.map((t) => ({ key: t.key, name: t.name }))}
          minimumDailyMinor={settings.minimumDailyBudgetMinor.toString()}
          currency={organization.currency}
          today={localDateOf(new Date(), organization.timezone)}
          taxPercent={taxRate.rateBasisPoints / 100}
        />
      )}
    </div>
  );
}
