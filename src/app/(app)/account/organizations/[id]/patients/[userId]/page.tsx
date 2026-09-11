/**
 * TL-PAGE-ORG-PATIENT-RECORD-001 — /account/organizations/:id/patients/:userId
 *
 * A patient's dental record for the practice, under the patient's grant. Each
 * visit to this page is an audited view the patient sees. Adds entries and
 * files and retracts the practice's own when the grant allows adding; issues
 * prescriptions when the viewer is also a verified dentist. 404 without a grant.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { practiceRecord } from '@/platform/records/service';
import { isAppError } from '@/platform/kernel/errors';
import { Card, CardBody, CardHeader } from '@/design-system';
import { EntryForm } from '@/components/records/entry-form';
import { PrescriptionForm } from '@/components/records/prescription-form';
import { PrescriptionList, RecordTimeline } from '@/components/records/record-timeline';
import { TreatmentPlanList } from '@/components/records/treatment-plans';
import { ProposePlanForm } from '@/components/records/propose-plan-form';
import { db } from '@/platform/db/client';

export const metadata: Metadata = { title: 'Patient record', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PatientRecordPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await practiceRecord(principal, id, userId).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const [treatments, organization] = await Promise.all([
    db().treatment.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } }),
    db().organization.findUnique({ where: { id }, select: { currency: true } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const visits = data.appointments.map((a) => ({ id: a.id, label: `${a.serviceName}, ${date(a.startsAt)}` }));
  const name = data.patient?.displayName ?? 'Patient';

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}/patients`}>Patients’ records</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{name}</span>
      </nav>
      <header className="tl-page__header">
        <h1>{name}</h1>
        <p className="tl-page__lead">
          Shared with {data.organization?.name ?? 'your practice'} — {data.grant.canWrite ? 'read and add' : 'read only'}, {data.grant.expiresAt ? `until ${date(data.grant.expiresAt)}` : 'until the patient withdraws it'}. The patient can see that you opened this.
        </p>
        {data.dependents.length > 0 ? <p className="tl-muted">Family on this account: {data.dependents.map((d) => `${d.name} (${d.relationship.toLowerCase()}${d.birthYear ? `, born ${d.birthYear}` : ''})`).join('; ')}</p> : null}
      </header>

      {data.canWrite ? (
        <Card label="Add to the record">
          <CardHeader>
            <strong>Add to the record</strong>
          </CardHeader>
          <CardBody>
            <EntryForm endpoint={`/api/v1/organizations/${id}/patients/${userId}/record/entries`} today={today} dependents={data.dependents} appointments={visits} />
          </CardBody>
        </Card>
      ) : null}

      <Card label="Prescribe">
        <CardHeader>
          <strong>Prescribe</strong>
        </CardHeader>
        <CardBody>
          {data.canPrescribe ? (
            <PrescriptionForm organizationId={id} patientUserId={userId} dependents={data.dependents} appointments={visits} />
          ) : (
            <p className="tl-muted" style={{ margin: 0 }}>
              {!data.grant.canWrite
                ? 'The patient has let you read their record, not add to it — a prescription needs that.'
                : !data.isVerifiedDentist
                  ? 'Only a dentist whose credentials Toothlogy has verified can issue a prescription.'
                  : 'Your role at this practice does not include prescribing.'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card label="Treatment plans">
        <CardHeader>
          <strong>Treatment plans</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            {data.canWrite ? (
              <ProposePlanForm endpoint={`/api/v1/organizations/${id}/patients/${userId}/treatment-plans`} currency={organization?.currency ?? 'INR'} dependents={data.dependents} treatments={treatments} />
            ) : (
              <p className="tl-muted" style={{ margin: 0 }}>
                The patient has let you read their record, not add to it — proposing a treatment plan needs that.
              </p>
            )}
            <TreatmentPlanList plans={data.treatmentPlans} viewer={{ kind: 'PRACTICE', organizationId: id, canWrite: data.canWrite }} />
          </div>
        </CardBody>
      </Card>

      <Card label="Record">
        <CardHeader>
          <strong>Record</strong>
        </CardHeader>
        <CardBody>
          <RecordTimeline entries={data.entries} viewer={{ kind: 'PRACTICE', organizationId: id, canRetract: data.canWrite }} />
        </CardBody>
      </Card>

      <Card label="Prescriptions">
        <CardHeader>
          <strong>Prescriptions</strong>
        </CardHeader>
        <CardBody>
          <PrescriptionList prescriptions={data.prescriptions} />
        </CardBody>
      </Card>
    </div>
  );
}
