/**
 * TL-PAGE-ADMIN-CAMPAIGNS-001 — /admin/campaigns
 *
 * Every organization's Prime campaigns for Toothlogy staff, by status, with a
 * route into each organization's campaign pages — where staff create, edit,
 * activate, pause, resume and cancel under the same validation, wallet rules
 * and audit as the practice itself. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listAllCampaigns, primeTier } from '@/platform/sponsored/service';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';

export const metadata: Metadata = { title: 'Campaigns (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'EXHAUSTED', 'CANCELLED'];

export default async function AdminCampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/campaigns');
  if (!can(principal, 'tl.advertising.campaign.administer')) notFound();
  const sp = await searchParams;
  const status = typeof sp.status === 'string' && STATUSES.includes(sp.status) ? sp.status : undefined;

  const [campaigns, organizations] = await Promise.all([
    listAllCampaigns(principal, { status }),
    db().organization.findMany({ where: { deletedAt: null, type: { in: ['CLINIC', 'HOSPITAL'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
  ]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '64rem' }}>
      <header className="tl-page__header">
        <h1>Campaigns (staff)</h1>
        <p className="tl-page__lead">Prime campaigns across every organization. Every action is audited on the campaign.</p>
      </header>

      <nav aria-label="Filter by status" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href="/admin/campaigns" aria-current={!status ? 'page' : undefined} className={`tl-button tl-button--sm ${!status ? 'tl-button--primary' : 'tl-button--ghost'}`}>
          <span>All</span>
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/campaigns?status=${s}`} aria-current={status === s ? 'page' : undefined} className={`tl-button tl-button--sm ${status === s ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>{s.toLowerCase()}</span>
          </Link>
        ))}
      </nav>

      <Card label="Campaigns">
        <CardBody>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns" description={status ? 'None with this status.' : 'No organization has created a campaign yet.'} />
          ) : (
            <Table caption="Sponsored campaigns">
              <thead>
                <tr>
                  <th scope="col">Organization</th>
                  <th scope="col">Campaign</th>
                  <th scope="col">Promotes</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Budget / spent</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.organization.name}</td>
                    <td>
                      <Link href={`/account/organizations/${c.organizationId}/campaigns/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>
                      {primeTier(c.subjectType, c.organization.type)}
                      {c.subjectType === 'PRACTICE' ? `: ${c.practice?.dentistProfile.user.displayName ?? 'Dentist'}` : ''}
                    </td>
                    <td>
                      <Badge tone={c.status === 'ACTIVE' ? 'success' : c.status === 'PAUSED' ? 'warning' : c.status === 'CANCELLED' ? 'danger' : 'neutral'}>{c.status.toLowerCase()}</Badge>
                    </td>
                    <td>
                      {when(c.startsAt)} – {when(new Date(c.endsAt.getTime() - 1))}
                    </td>
                    <td>
                      {formatMoney({ amountMinor: c.budgetMinor, currency: c.currency }, 'en-IN')} / {formatMoney({ amountMinor: c.spentMinor, currency: c.currency }, 'en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card label="Create for an organization">
        <CardHeader>
          <strong>Create or manage for an organization</strong>
        </CardHeader>
        <CardBody>
          <ul className="tl-list">
            {organizations.map((o) => (
              <li key={o.id}>
                <Link href={`/account/organizations/${o.id}/campaigns`}>{o.name}</Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
