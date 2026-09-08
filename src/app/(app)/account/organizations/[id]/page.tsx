/**
 * TL-PAGE-ORGDETAIL-001 — /account/organizations/:id
 *
 * Authorization happens HERE, on the server, before any data is read.
 * `currentUserCan` is checked against this specific organization, so a member
 * of a different clinic gets a 404 rather than another practice's staff list.
 *
 * A 404 rather than a 403 is deliberate: telling an unauthorised caller that
 * the organization exists is itself a disclosure.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getOrganization } from '@/platform/organizations/service';
import { listLocations } from '@/platform/organizations/locations';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { InviteMemberForm } from './invite-member-form';

export const metadata: Metadata = {
  title: 'Organization',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();

  // The cross-tenant check. Without it, any signed-in user could read any
  // organization by guessing an id.
  const canRead = await currentUserCan('tl.core.organization.read', { organizationId: id });
  if (!canRead) notFound();

  const canManage = await currentUserCan('tl.core.organization.manage', {
    organizationId: id,
  });

  const [organization, locations] = await Promise.all([
    getOrganization(id),
    listLocations(id),
  ]);

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account">Account</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{organization.name}</span>
      </nav>

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{organization.name}</h1>
          {organization.verifiedAt ? (
            <Badge tone="success">Verified</Badge>
          ) : (
            <Badge tone="warning">Pending verification</Badge>
          )}
        </div>
        <p className="tl-page__lead">
          {organization.type.toLowerCase()} · {organization.countryCode} ·{' '}
          {organization.currency} · /{organization.slug}
        </p>
      </header>

      {!organization.verifiedAt ? (
        <Card label="Verification status">
          <CardBody>
            <p className="tl-muted" style={{ margin: 0 }}>
              This organization is not publicly discoverable yet. Verification of dentist and
              clinic credentials is built in Phase 3 — until then, no organization can be
              verified, and none appear in patient search.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Members">
        <CardHeader>
          <strong>Members</strong>
        </CardHeader>
        <CardBody>
          <Table caption={`People in ${organization.name}`}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {organization.members.map((m) => (
                <tr key={m.user.id}>
                  <td>{m.user.displayName ?? '—'}</td>
                  <td>{m.user.email ?? '—'}</td>
                  <td>{m.roleKey.replace(/_/g, ' ')}</td>
                  <td>{m.joinedAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {/*
       * The invite form is rendered only for managers. This is a UX affordance,
       * not the control: the API re-checks the permission on every request.
       */}
      {canManage ? <InviteMemberForm organizationId={id} /> : null}

      <Card label="Locations">
        <CardHeader>
          <strong>Locations</strong>
        </CardHeader>
        <CardBody>
          {locations.length === 0 ? (
            <EmptyState
              title="No locations yet"
              description="Add a branch with its address and opening hours so patients can find it."
            />
          ) : (
            <ul className="tl-list">
              {locations.map((l) => (
                <li key={l.id}>
                  <div className="tl-card__title-row">
                    <strong>{l.name}</strong>
                    {l.latitude !== null && l.longitude !== null ? (
                      <Badge tone="success">Discoverable</Badge>
                    ) : (
                      <Badge tone="warning">No coordinates</Badge>
                    )}
                  </div>
                  <span className="tl-list__meta">
                    {l.address ? `${l.address.lines.join(', ')} · ` : ''}
                    {l.timezone}
                  </span>
                  {l.businessHours.length > 0 ? (
                    <span className="tl-list__meta">
                      {l.businessHours
                        .map(
                          (h) =>
                            `${DAY_NAMES[h.dayOfWeek]?.slice(0, 3)} ${formatMinutes(h.opensAtMinutes)}–${formatMinutes(h.closesAtMinutes)}`,
                        )
                        .join(' · ')}
                    </span>
                  ) : (
                    <span className="tl-list__meta">No opening hours set</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
