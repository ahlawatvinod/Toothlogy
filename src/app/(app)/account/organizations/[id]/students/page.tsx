/**
 * TL-PAGE-ORG-STUDENTS-001 — /account/organizations/:id/students
 *
 * A college's roll: enrolled, completed and withdrawn students by course and
 * academic year, with their contact details and roll numbers; mark an
 * enrolment completed or withdrawn. Only the college's administrators
 * (tl.education.enrolment.manage); 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { collegeRoll, ENROLMENT_STATUS_LABEL, isAcademicYear } from '@/platform/education/enrolments';
import { LEVEL_LABEL } from '@/platform/education/colleges';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';
import { EndEnrolment } from '@/components/education/enrolment-forms';

export const metadata: Metadata = { title: 'Students', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);
const STATUSES = ['ENROLLED', 'COMPLETED', 'WITHDRAWN'] as const;

export default async function StudentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const year = one(sp.year);
  const status = STATUSES.find((s) => s === one(sp.status));
  const data = await collegeRoll(principal, id, { courseId: one(sp.course), academicYear: year && isAcademicYear(year) ? year : undefined, status }).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{data.organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Students</span>
      </nav>
      <header className="tl-page__header">
        <h1>Students</h1>
        <p className="tl-page__lead">
          Students you enrolled. Enrol admitted students from <Link href={`/account/organizations/${id}/admissions?status=ADMITTED`}>Admissions</Link>.
        </p>
      </header>
      <form method="get" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} aria-label="Filter students">
        <label className="tl-stack">
          <span>Course</span>
          <select className="tl-input" name="course" defaultValue={one(sp.course) ?? ''}>
            <option value="">All</option>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-stack">
          <span>Year</span>
          <select className="tl-input" name="year" defaultValue={year ?? ''}>
            <option value="">All</option>
            {data.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-stack">
          <span>Status</span>
          <select className="tl-input" name="status" defaultValue={status ?? ''}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ENROLMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="tl-button tl-button--secondary">
          <span>Show</span>
        </button>
      </form>
      {data.enrolments.length === 0 ? (
        <EmptyState title="No students here" description="Enrolled students appear here." />
      ) : (
        <ul className="tl-list" aria-label="Students">
          {data.enrolments.map((e) => (
            <li key={e.id}>
              <Card label={e.student.displayName ?? 'Student'}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{e.student.displayName ?? 'Student'}</strong>
                      <Badge tone={e.status === 'ENROLLED' ? 'info' : e.status === 'COMPLETED' ? 'success' : 'neutral'}>{ENROLMENT_STATUS_LABEL[e.status]}</Badge>
                    </div>
                    <span className="tl-list__meta">
                      {e.course.name} ({LEVEL_LABEL[e.course.level]}) · {e.academicYear}
                      {e.rollNumber ? ` · roll ${e.rollNumber}` : ''} · from {date(e.startedOn)}
                      {e.endedOn ? ` to ${date(e.endedOn)}` : ''}
                      {e.endedReason ? ` — ${e.endedReason}` : ''}
                    </span>
                    <span className="tl-list__meta">
                      {e.student.email ? <a href={`mailto:${e.student.email}`}>{e.student.email}</a> : 'no email'}
                      {e.student.phone ? (
                        <>
                          {' · '}
                          <a href={`tel:${e.student.phone}`}>{e.student.phone}</a>
                        </>
                      ) : null}
                    </span>
                    {e.status === 'ENROLLED' ? <EndEnrolment enrolmentId={e.id} today={today} /> : null}
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
