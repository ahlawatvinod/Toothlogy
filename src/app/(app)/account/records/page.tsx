/**
 * TL-PAGE-MY-RECORD-001 — /account/records
 *
 * The patient's dental record: requests from practices to allow or decline,
 * who can see it (and until when) with withdrawal, sharing with a practice
 * they have been to, adding their own notes and files, the record itself,
 * prescriptions, and every time someone else looked.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { myRecord } from '@/platform/records/service';
import { Card, CardBody, CardHeader } from '@/design-system';
import { EntryForm } from '@/components/records/entry-form';
import { PrescriptionList, RecordTimeline } from '@/components/records/record-timeline';
import { RespondToRequest, ShareRecordForm, WithdrawAccess } from '@/components/records/grant-controls';
import { TreatmentPlanList } from '@/components/records/treatment-plans';

export const metadata: Metadata = { title: 'Dental record', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyRecordPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/records');
  const data = await myRecord(principal);
  const today = new Date().toISOString().slice(0, 10);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Dental record</h1>
        <p className="tl-page__lead">Yours. A practice sees it only while you let it, and you can see every time someone looks.</p>
      </header>

      {data.requests.length > 0 ? (
        <Card label="Requests to see your record">
          <CardHeader>
            <strong>Requests to see your record</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list" aria-label="Requests">
              {data.requests.map((r) => (
                <li key={r.id} className="tl-stack" aria-label={`Request from ${r.organization.name}`}>
                  <span>
                    <strong>{r.organization.name}</strong> asked on {date(r.createdAt)}
                    {r.requestNote ? ` — “${r.requestNote}”` : ''}
                  </span>
                  <RespondToRequest grantId={r.id} practice={r.organization.name} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Who can see your record">
        <CardHeader>
          <strong>Who can see your record</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-stack">
            {data.grants.length === 0 ? (
              <p style={{ margin: 0 }}>Nobody but you.</p>
            ) : (
              <ul className="tl-list" aria-label="Practices with access">
                {data.grants.map((g) => (
                  <li key={g.id} className="tl-stack" aria-label={g.organization.name}>
                    <span>
                      <strong>{g.organization.name}</strong> · {g.canWrite ? 'can read and add' : 'can read'} · {g.expiresAt ? `until ${date(g.expiresAt)}` : 'until you withdraw it'}
                    </span>
                    <WithdrawAccess grantId={g.id} practice={g.organization.name} />
                  </li>
                ))}
              </ul>
            )}
            {data.shareable.length > 0 ? (
              <ShareRecordForm practices={data.shareable} />
            ) : (
              <p className="tl-muted" style={{ margin: 0 }}>
                You can share your record with a practice you have an appointment with.
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card label="Add to your record">
        <CardHeader>
          <strong>Add to your record</strong>
        </CardHeader>
        <CardBody>
          <EntryForm endpoint="/api/v1/me/records/entries" today={today} dependents={data.dependents} />
        </CardBody>
      </Card>

      <Card label="Treatment plans">
        <CardHeader>
          <strong>Treatment plans</strong>
        </CardHeader>
        <CardBody>
          <TreatmentPlanList plans={data.treatmentPlans} viewer={{ kind: 'PATIENT' }} />
        </CardBody>
      </Card>

      <Card label="Your record">
        <CardHeader>
          <strong>Your record</strong>
        </CardHeader>
        <CardBody>
          <RecordTimeline entries={data.entries} viewer={{ kind: 'PATIENT', userId: principal.userId }} />
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

      <Card label="Who looked">
        <CardHeader>
          <strong>Who looked</strong>
        </CardHeader>
        <CardBody>
          {data.history.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              Nobody else has opened your record.
            </p>
          ) : (
            <ul className="tl-list" aria-label="Who looked">
              {data.history.map((h, i) => (
                <li key={i}>
                  <strong>{h.who}</strong>
                  {h.practice ? ` at ${h.practice}` : ''} {h.what}
                  <span className="tl-list__meta"> · {when(h.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
