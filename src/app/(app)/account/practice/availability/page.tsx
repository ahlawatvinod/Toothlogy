/**
 * TL-PAGE-PRACTICE-AVAILABILITY-001 — /account/practice/availability
 *
 * Weekly sessions, leave and blocked time for each practice the signed-in
 * user may manage: their own as a dentist, and those at organizations where
 * they hold `tl.appointment.availability.manage`.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listAvailability } from '@/platform/appointments/availability-admin';
import { EmptyState } from '@/design-system';
import { AvailabilityEditor } from './availability-editor';

export const metadata: Metadata = { title: 'Availability', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function AvailabilityPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/practice/availability');

  const manageableOrgs = principal.organizations
    .map((o) => o.organizationId)
    .filter((id) => can(principal, 'tl.appointment.availability.manage', { organizationId: id }));
  const practices = await db().dentistPractice.findMany({
    where: {
      location: { deletedAt: null },
      OR: [{ dentistProfile: { userId: principal.userId } }, { location: { organizationId: { in: manageableOrgs } } }],
    },
    select: { id: true, dentistProfile: { select: { user: { select: { displayName: true } } } }, location: { select: { organization: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
  const loaded = await Promise.all(practices.map((p) => listAvailability(principal, p.id)));

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account/practice">Practice</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Availability</span>
      </nav>
      <header className="tl-page__header">
        <h1>Availability</h1>
        <p className="tl-page__lead">
          Patients can book only inside these sessions and the clinic’s opening hours, never over leave, blocks or another appointment.
        </p>
      </header>
      {practices.length === 0 ? (
        <EmptyState title="No practices to manage" description="Add a practice location to your dentist profile and have the clinic confirm it." />
      ) : (
        practices.map((p, i) => (
          <AvailabilityEditor
            key={p.id}
            title={`${p.dentistProfile.user.displayName ?? 'Dentist'} · ${p.location.organization.name}, ${loaded[i]!.locationName}`}
            availability={loaded[i]!}
          />
        ))
      )}
    </div>
  );
}
