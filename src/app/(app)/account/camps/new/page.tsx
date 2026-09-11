/**
 * TL-PAGE-CAMP-NEW-001 — /account/camps/new
 *
 * Plan a camp: title, district, venue, dates, capacity, what is offered,
 * optionally for an organization the person manages. Saved as a draft.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { ORGANIZE } from '@/platform/camps/service';
import { listDistricts } from '@/platform/india-data/districts';
import { db } from '@/platform/db/client';
import { Card, CardBody } from '@/design-system';
import { CampForm } from './camp-form';

export const metadata: Metadata = { title: 'Organize a camp', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NewCampPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/camps/new');
  if (!can(principal, ORGANIZE)) notFound();
  const manageable = principal.organizations.map((o) => o.organizationId).filter((organizationId) => can(principal, 'tl.core.organization.manage', { organizationId }));
  const [districts, organizations] = await Promise.all([
    listDistricts({ countryCode: 'IN' }),
    db().organization.findMany({ where: { id: { in: manageable }, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/camps">My camps</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Organize a camp</span>
      </nav>
      <header className="tl-page__header">
        <h1>Organize a camp</h1>
        <p className="tl-page__lead">Saved as a draft. Submit it for review when the details are right; it is listed once Toothlogy approves it.</p>
      </header>
      <Card label="Camp details">
        <CardBody>
          <CampForm districts={districts.map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` }))} organizations={organizations} />
        </CardBody>
      </Card>
    </div>
  );
}
