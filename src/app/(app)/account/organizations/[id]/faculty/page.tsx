/**
 * TL-PAGE-ORG-FACULTY-001 — /account/organizations/:id/faculty
 *
 * A college's faculty: requests to confirm, confirmed posts (end them), and
 * past decisions. For the college's administrators; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { collegeFaculty } from '@/platform/academic/service';
import { db } from '@/platform/db/client';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { FacultyDecision } from './faculty-decision';

export const metadata: Metadata = { title: 'Faculty', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function CollegeFacultyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const appointments = await collegeFaculty(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!appointments) notFound();
  const organization = await db().organization.findUniqueOrThrow({ where: { id }, select: { name: true } });
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Faculty</span>
      </nav>
      <header className="tl-page__header">
        <h1>Faculty</h1>
        <p className="tl-page__lead">Confirm only people who hold the post: a confirmed post appears on their public profile and your college page as the college’s word.</p>
      </header>
      <Card label="Faculty posts">
        <CardBody>
          {appointments.length === 0 ? (
            <EmptyState title="No requests yet" description="Faculty members ask you to confirm their post from their academic profile." />
          ) : (
            <ul className="tl-list" aria-label="Faculty posts">
              {appointments.map((a) => (
                <li key={a.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>{a.profile.displayName}</strong>
                    <Badge tone={a.status === 'CONFIRMED' ? 'success' : a.status === 'PENDING' ? 'info' : 'neutral'}>{a.status.toLowerCase()}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {a.designation}
                    {a.department ? `, ${a.department}` : ''} · asked {when(a.requestedAt)}
                    {a.profile.user.email ? ` · ${a.profile.user.email}` : ''}
                    {a.profile.academic?.orcid ? ` · ORCID ${a.profile.academic.orcid}` : ''}
                  </span>
                  {a.status === 'PENDING' || a.status === 'CONFIRMED' ? <FacultyDecision appointmentId={a.id} status={a.status} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
