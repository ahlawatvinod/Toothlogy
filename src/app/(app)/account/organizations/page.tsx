/**
 * TL-PAGE-ACCOUNT-ORGS-001 — /account/organizations
 *
 * The organizations the user belongs to, with each one's verification state
 * stated plainly — a pending clinic is not visible to patients, and its
 * administrators need to know that before wondering why nobody books.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listUserOrganizations } from '@/platform/organizations/service';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Organizations', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  CLINIC: 'Clinic',
  HOSPITAL: 'Hospital',
  COLLEGE: 'College',
  SUPPLIER: 'Supplier',
  MANUFACTURER: 'Manufacturer',
  DISTRIBUTOR: 'Distributor',
  EMPLOYER: 'Employer',
};

export default async function OrganizationsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/organizations');

  const organizations = await listUserOrganizations(principal.userId);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>Organizations</h1>
          <Link className="tl-button tl-button--primary tl-button--md" href="/account/organizations/new">
            Create an organization
          </Link>
        </div>
        <p className="tl-page__lead">Clinics, hospitals, colleges and suppliers you are part of.</p>
      </header>

      {organizations.length === 0 ? (
        <EmptyState
          title="You are not part of any organization"
          description="Create one to manage a clinic or supplier on Toothlogy, or ask an administrator to invite you."
        />
      ) : (
        <div className="tl-card-grid">
          {organizations.map((org) => (
            <Card key={org.id} label={org.name}>
              <CardBody>
                <div className="tl-card__title-row">
                  <Link href={`/account/organizations/${org.id}`}>
                    <strong>{org.name}</strong>
                  </Link>
                  {org.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
                </div>
                <p className="tl-list__meta" style={{ marginBlockEnd: 0 }}>
                  {TYPE_LABEL[org.type] ?? org.type} · your role: {org.roleKey.replace(/_/g, ' ')}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
