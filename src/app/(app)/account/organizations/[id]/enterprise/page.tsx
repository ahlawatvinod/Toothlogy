/**
 * TL-PAGE-ORG-ENTERPRISE-001 — /account/organizations/:id/enterprise
 *
 * The group's enterprise agreement as its members see it: terms, support
 * service-level results, data residency against the declared hosting region,
 * single sign-on status, and the member organizations. For those with
 * tl.enterprise.agreement.read; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { groupConsole } from '@/platform/enterprise/service';
import { isAppError } from '@/platform/kernel/errors';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { AgreementSummary } from '@/components/enterprise/agreement-summary';

export const metadata: Metadata = { title: 'Enterprise agreement', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OrganizationEnterprisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await groupConsole(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, agreement } = data;

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Enterprise</span>
      </nav>
      <header className="tl-page__header">
        <h1>Enterprise agreement</h1>
        <p className="tl-page__lead">{organization.parent ? `${organization.name} is part of ${organization.parent.name}; the group’s agreement covers it.` : organization.children.length > 0 ? `${organization.name} is a group of ${organization.children.length} organizations.` : 'Agreements with Toothlogy for chains and hospital groups.'}</p>
      </header>
      <Card label="Agreement">
        <CardHeader>
          <strong>Agreement</strong>
        </CardHeader>
        <CardBody>
          {agreement ? <AgreementSummary agreement={agreement} /> : <EmptyState title="No enterprise agreement" description="Chains and hospital groups can agree support service levels, data residency and single sign-on with Toothlogy. Contact support to start." />}
        </CardBody>
      </Card>
      {organization.children.length > 0 ? (
        <Card label="Member organizations">
          <CardHeader>
            <strong>Member organizations</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list" aria-label="Members">
              {organization.children.map((c) => (
                <li key={c.id}>
                  {c.name} <span className="tl-muted">· {c.type.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
