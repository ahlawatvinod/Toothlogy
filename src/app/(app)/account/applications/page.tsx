/**
 * TL-PAGE-MY-APPLICATIONS-001 — /account/applications
 *
 * The applicant's job and internship applications: where each stands, any
 * interview time and message from the employer; withdraw one that stands.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { myApplications } from '@/platform/careers/service';
import { APPLICATION_STATUS_LABEL } from '@/platform/careers/labels';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { WithdrawApplication } from '@/components/careers/application-actions';

export const metadata: Metadata = { title: 'My applications', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STANDING = new Set(['SUBMITTED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED']);

export default async function MyApplicationsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/applications');
  const applications = await myApplications(principal);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My applications</h1>
        <p className="tl-page__lead">
          Jobs and internships you applied for. <Link href="/careers">Find more</Link>.
        </p>
      </header>
      {applications.length === 0 ? (
        <EmptyState title="No applications yet" description="Apply from any opening under Jobs and internships." />
      ) : (
        <ul className="tl-list" aria-label="My applications">
          {applications.map((a) => (
            <li key={a.id}>
              <Card label={a.posting.title}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/careers/${a.posting.id}`}>
                        <strong>{a.posting.title}</strong>
                      </Link>
                      <Badge tone={a.status === 'HIRED' || a.status === 'OFFERED' ? 'success' : a.status === 'REJECTED' || a.status === 'WITHDRAWN' ? 'neutral' : 'info'}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      {a.posting.organization.name} · applied {date(a.createdAt)}
                    </span>
                    {a.status === 'INTERVIEW' && a.interviewAt ? <p style={{ margin: 0 }}>Interview: {when(a.interviewAt)}</p> : null}
                    {a.messageToApplicant ? <p style={{ margin: 0 }}>From the employer: “{a.messageToApplicant}”</p> : null}
                    {STANDING.has(a.status) ? <WithdrawApplication applicationId={a.id} /> : null}
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
