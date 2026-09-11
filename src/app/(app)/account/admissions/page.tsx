/**
 * TL-PAGE-MY-ADMISSIONS-001 — /account/admissions
 *
 * The student's admission enquiries: college, course, academic year, status,
 * and withdraw while it is open.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { ENQUIRY_STATUS_LABEL, myEnquiries } from '@/platform/education/enquiries';
import { LEVEL_LABEL } from '@/platform/education/colleges';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { WithdrawEnquiry } from './withdraw-enquiry';
import { ENROLMENT_STATUS_LABEL, myEnrolments } from '@/platform/education/enrolments';

export const metadata: Metadata = { title: 'My admissions', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const OPEN = ['NEW', 'CONTACTED', 'APPLIED'];

export default async function MyAdmissionsPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/admissions');
  const [enquiries, enrolments] = await Promise.all([myEnquiries(principal), myEnrolments(principal)]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>My admissions</h1>
        <p className="tl-page__lead">
          Your enquiries to dental colleges. <Link href="/colleges">Find a college</Link>
        </p>
      </header>
      {enrolments.length > 0 ? (
        <Card label="Enrolments">
          <CardBody>
            <ul className="tl-list" aria-label="Enrolments">
              {enrolments.map((e) => (
                <li key={e.id}>
                  <div className="tl-card__title-row">
                    <strong>
                      {e.course.name} at {e.organization.name}
                    </strong>
                    <Badge tone={e.status === 'ENROLLED' ? 'info' : e.status === 'COMPLETED' ? 'success' : 'neutral'}>{ENROLMENT_STATUS_LABEL[e.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {e.academicYear}
                    {e.rollNumber ? ` · roll ${e.rollNumber}` : ''} · from {day(e.startedOn)}
                    {e.endedOn ? ` to ${day(e.endedOn)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
      {enquiries.length === 0 ? (
        <EmptyState title="No enquiries yet" description="Ask a college about a course from its page on Toothlogy." />
      ) : (
        <ul className="tl-list" aria-label="Admission enquiries">
          {enquiries.map((e) => (
            <li key={e.id}>
              <Card label={`${e.course.name} at ${e.organization.name}`}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{e.course.name}</strong>
                      <Badge tone={e.status === 'ADMITTED' ? 'success' : OPEN.includes(e.status) ? 'info' : 'neutral'}>{ENQUIRY_STATUS_LABEL[e.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      <Link href={`/colleges/${e.organization.slug}`}>{e.organization.name}</Link> · {LEVEL_LABEL[e.course.level]}
                      {e.cycle ? ` · ${e.cycle.academicYear}` : ''} · sent {when(e.createdAt)}
                    </span>
                    {OPEN.includes(e.status) ? <WithdrawEnquiry enquiryId={e.id} /> : null}
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
