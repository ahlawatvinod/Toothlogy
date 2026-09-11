/**
 * TL-PAGE-ORG-PATIENTS-001 — /account/organizations/:id/patients
 *
 * Patients who shared their dental record with the practice, requests still
 * waiting for the patient, and recent patients the practice may ask. For
 * members who may read records (clinic administrators, clinicians); 404 for
 * anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { practicePatients } from '@/platform/records/service';
import { isAppError } from '@/platform/kernel/errors';
import { Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { RequestAccessButton } from '@/components/records/grant-controls';

export const metadata: Metadata = { title: 'Patients’ records', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PracticePatientsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await practicePatients(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{data.organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Patients’ records</span>
      </nav>
      <header className="tl-page__header">
        <h1>Patients’ records</h1>
        <p className="tl-page__lead">A patient’s dental record is theirs. You see it only while they allow it; each time you open it, they can see that you did.</p>
      </header>

      <Card label="Shared with you">
        <CardHeader>
          <strong>Shared with you</strong>
        </CardHeader>
        <CardBody>
          {data.active.length === 0 ? (
            <EmptyState title="No shared records" description="Ask a patient below, or they can share from their account." />
          ) : (
            <ul className="tl-list" aria-label="Shared records">
              {data.active.map((g) => (
                <li key={g.grantId}>
                  <Link href={`/account/organizations/${id}/patients/${g.userId}`}>
                    <strong>{g.name}</strong>
                  </Link>
                  <span className="tl-list__meta">
                    {' '}
                    · {g.canWrite ? 'read and add' : 'read only'} · {g.expiresAt ? `until ${date(g.expiresAt)}` : 'until they withdraw it'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {data.requested.length > 0 ? (
        <Card label="Waiting for the patient">
          <CardHeader>
            <strong>Waiting for the patient</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list" aria-label="Waiting for the patient">
              {data.requested.map((g) => (
                <li key={g.grantId}>
                  <strong>{g.name}</strong>
                  <span className="tl-list__meta"> · asked {date(g.since)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Ask a patient">
        <CardHeader>
          <strong>Ask a patient</strong>
        </CardHeader>
        <CardBody>
          {data.others.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              Patients with an appointment here in the last year appear here.
            </p>
          ) : (
            <ul className="tl-list" aria-label="Recent patients">
              {data.others.map((o) => (
                <li key={o.userId} className="tl-stack" aria-label={o.name}>
                  <span>
                    <strong>{o.name}</strong>
                    <span className="tl-list__meta"> · last appointment {date(o.lastVisit)}</span>
                  </span>
                  <RequestAccessButton organizationId={id} userId={o.userId} name={o.name} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
