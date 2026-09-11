/**
 * TL-PAGE-ADMIN-ENTERPRISE-001 — /admin/enterprise
 *
 * Enterprise agreements for staff: each with its group, members, support
 * service-level results, data residency against the declared hosting region
 * and single sign-on against the SSO port; record an agreement from the
 * signed contract, end one, and put organizations into or out of a group.
 * 404 without tl.admin.enterprise.manage.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { ENTERPRISE_MANAGE, enterpriseAdmin, hostingRegion } from '@/platform/enterprise/service';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { AgreementSummary } from '@/components/enterprise/agreement-summary';
import { AgreementForm, EndAgreementButton, MembershipForm } from '@/components/enterprise/enterprise-forms';

export const metadata: Metadata = { title: 'Enterprise (staff)', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EnterpriseAdminPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/admin/enterprise');
  if (!can(principal, ENTERPRISE_MANAGE)) notFound();
  const [agreements, organizations, countries] = await Promise.all([
    enterpriseAdmin(principal),
    db().organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true, parentOrganizationId: true, parent: { select: { name: true } }, _count: { select: { children: true } } }, orderBy: { name: 'asc' }, take: 500 }),
    db().country.findMany({ select: { code: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const groups = organizations.filter((o) => o.parentOrganizationId === null).map((o) => ({ id: o.id, name: o.name }));
  const today = new Date().toISOString().slice(0, 10);
  const hosted = hostingRegion();

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <header className="tl-page__header">
        <h1>Enterprise</h1>
        <p className="tl-page__lead">
          Agreements are recorded from contracts signed outside Toothlogy. This deployment declares its hosting region as {hosted ?? 'nothing (TOOTHLOGY_HOSTING_REGION is not set)'}.
        </p>
      </header>
      <Card label="Agreements">
        <CardHeader>
          <strong>Agreements</strong>
        </CardHeader>
        <CardBody>
          {agreements.length === 0 ? (
            <EmptyState title="No agreements" description="Record one below once the contract is signed." />
          ) : (
            <ul className="tl-list" aria-label="Agreements">
              {agreements.map((a) => (
                <li key={a.id} className="tl-stack">
                  <span>
                    <strong>{a.group.name}</strong> · {a.group.members} member {a.group.members === 1 ? 'organization' : 'organizations'}
                  </span>
                  <AgreementSummary agreement={a} />
                  {a.status === 'ACTIVE' ? <EndAgreementButton agreementId={a.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <Card label="Record an agreement">
        <CardHeader>
          <strong>Record an agreement</strong>
        </CardHeader>
        <CardBody>
          <AgreementForm groups={groups} countries={countries} today={today} />
        </CardBody>
      </Card>
      <Card label="Groups">
        <CardHeader>
          <strong>Groups</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ marginTop: 0 }}>
            A group is one level deep: a chain and its clinics. Support requests from a member follow the group’s agreement.
          </p>
          <MembershipForm groups={groups.filter((g) => !organizations.find((o) => o.id === g.id)?.parentOrganizationId)} organizations={organizations.filter((o) => o._count.children === 0).map((o) => ({ id: o.id, name: o.name, group: o.parent?.name ?? null }))} />
        </CardBody>
      </Card>
    </div>
  );
}
