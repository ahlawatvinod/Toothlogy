/**
 * TL-PAGE-ORG-ADMISSIONS-001 — /account/organizations/:id/admissions
 *
 * A college's admission enquiries: numbers by status, each enquiry with the
 * student's details (shared with consent), what they told the college (exam
 * and rank shown as their own statement), history and actions. Members who
 * may read enquiries see it; only administrators act, or the assignee takes
 * notes and follow-ups. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AdmissionEnquiryStatus } from '@prisma/client';
import { currentPrincipal } from '@/platform/auth/server';
import { can, isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { ENQUIRY_STATUS_LABEL, enquiryStats, listEnquiries } from '@/platform/education/enquiries';
import { EXAM_LABEL, LEVEL_LABEL } from '@/platform/education/colleges';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { EnquiryActions } from './enquiry-actions';
import { enrolmentsByEnquiry, ENROLMENT_STATUS_LABEL } from '@/platform/education/enrolments';
import { EnrolAction } from '@/components/education/enrolment-forms';

export const metadata: Metadata = { title: 'Admissions', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const STATUSES: AdmissionEnquiryStatus[] = ['NEW', 'CONTACTED', 'APPLIED', 'ADMITTED', 'NOT_ADMITTED', 'WITHDRAWN', 'LOST'];
const OPEN = ['NEW', 'CONTACTED', 'APPLIED'];

export default async function AdmissionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal) || !can(principal, 'tl.education.enquiry.read', { organizationId: id })) notFound();
  const organization = await db().organization.findFirst({ where: { id, deletedAt: null, type: 'COLLEGE' }, select: { name: true } });
  if (!organization) notFound();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const canManage = can(principal, 'tl.education.enquiry.manage', { organizationId: id });
  const canEnrol = can(principal, 'tl.education.enrolment.manage', { organizationId: id });
  const [enquiries, stats, members, enrolled] = await Promise.all([
    listEnquiries(principal, id, { status }),
    enquiryStats(principal, id),
    db().organizationMember.findMany({ where: { organizationId: id, leftAt: null }, select: { userId: true, user: { select: { displayName: true, email: true } } } }),
    canEnrol ? enrolmentsByEnquiry(id) : Promise.resolve(new Map<string, { academicYear: string; rollNumber: string | null; status: string }>()),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = new Date().getUTCFullYear();
  const defaultYear = `${thisYear}-${String((thisYear + 1) % 100).padStart(2, '0')}`;
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Admissions</span>
      </nav>
      <header className="tl-page__header">
        <h1>Admission enquiries</h1>
        <p className="tl-page__lead">
          Students who asked about your courses and agreed to be contacted. <Link href={`/account/organizations/${id}/education`}>Courses</Link>
        </p>
      </header>

      <Card label="Numbers">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>All enquiries</dt>
              <dd>{stats.total}</dd>
            </div>
            <div>
              <dt>Open</dt>
              <dd>{stats.open}</dd>
            </div>
            {STATUSES.map((s) => (
              <div key={s}>
                <dt>
                  <Link href={`/account/organizations/${id}/admissions?status=${s}`}>{ENQUIRY_STATUS_LABEL[s]}</Link>
                </dt>
                <dd>{stats.byStatus[s] ?? 0}</dd>
              </div>
            ))}
            <div>
              <dt>Admitted of all</dt>
              <dd>{stats.admissionRate === null ? '—' : `${stats.admissionRate}%`}</dd>
            </div>
          </dl>
          {status ? <Link href={`/account/organizations/${id}/admissions`}>Show all</Link> : null}
        </CardBody>
      </Card>

      <Card label="Enquiries">
        <CardHeader>
          <strong>{status ? ENQUIRY_STATUS_LABEL[status] : 'All'} enquiries</strong>
        </CardHeader>
        <CardBody>
          {enquiries.length === 0 ? (
            <EmptyState title="No enquiries here" description="Enquiries arrive when students ask about a published course." />
          ) : (
            <ul className="tl-list" aria-label="Admission enquiries">
              {enquiries.map((e) => (
                <li key={e.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <strong>{e.student.displayName ?? 'Student'}</strong>
                    <Badge tone={e.status === 'ADMITTED' ? 'success' : OPEN.includes(e.status) ? 'info' : 'neutral'}>{ENQUIRY_STATUS_LABEL[e.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    {e.course.name} ({LEVEL_LABEL[e.course.level]}){e.cycle ? ` · ${e.cycle.academicYear}` : ''} · {when(e.createdAt)}
                  </span>
                  <span className="tl-list__meta">
                    {e.student.email ? <a href={`mailto:${e.student.email}`}>{e.student.email}</a> : 'no email'}
                    {e.student.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${e.student.phone}`}>{e.student.phone}</a>
                      </>
                    ) : null}
                    {e.assignedTo?.displayName ? ` · with ${e.assignedTo.displayName}` : ''}
                    {e.nextFollowUpAt ? ` · follow up ${when(e.nextFollowUpAt)}` : ''}
                  </span>
                  {e.qualification || e.examName || e.examRank ? (
                    <span className="tl-list__meta">
                      Student says: {[e.qualification, e.examName ? EXAM_LABEL[e.examName] : null, e.examRank ? `rank ${e.examRank}` : null].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  {e.message ? <span className="tl-list__meta">“{e.message}”</span> : null}
                  {e.events.length > 0 ? (
                    <ol className="tl-list" aria-label="History">
                      {e.events.map((ev) => (
                        <li key={ev.id} className="tl-list__meta">
                          {when(ev.createdAt)} · {ev.action.toLowerCase().replace(/_/g, ' ')}
                          {ev.note ? `: ${ev.note}` : ''}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {e.status === 'ADMITTED' && canEnrol ? (
                    enrolled.get(e.id) ? (
                      <span className="tl-list__meta">
                        {ENROLMENT_STATUS_LABEL[enrolled.get(e.id)!.status as 'ENROLLED']} for {enrolled.get(e.id)!.academicYear}
                        {enrolled.get(e.id)!.rollNumber ? `, roll ${enrolled.get(e.id)!.rollNumber}` : ''} · <Link href={`/account/organizations/${id}/students`}>Students</Link>
                      </span>
                    ) : (
                      <EnrolAction enquiryId={e.id} academicYear={e.cycle?.academicYear ?? defaultYear} today={today} />
                    )
                  ) : null}
                  {OPEN.includes(e.status) && (canManage || e.assignedToUserId === principal.userId) ? (
                    <EnquiryActions
                      enquiryId={e.id}
                      status={e.status}
                      canManage={canManage}
                      assignedToUserId={e.assignedToUserId}
                      members={members.map((m) => ({ userId: m.userId, name: m.user.displayName ?? m.user.email ?? 'Member' }))}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
