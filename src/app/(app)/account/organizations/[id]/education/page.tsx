/**
 * TL-PAGE-ORG-EDUCATION-001 — /account/organizations/:id/education
 *
 * A college's academic profile, its courses (add, edit, publish, archive)
 * and each course's admission windows. For the college's administrators;
 * 404 for anyone else, and for organizations that are not colleges.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { collegeConsole, EXAM_LABEL, LEVEL_LABEL, specialtyName } from '@/platform/education/colleges';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { CollegeProfileForm, CourseEditor, NewCourseForm } from './education-forms';

export const metadata: Metadata = { title: 'Courses', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function EducationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await collegeConsole(principal, id).catch((error) => {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'PRECONDITION_FAILED')) return null;
    throw error;
  });
  if (!data) notFound();
  const { organization, profile, courses } = data;
  const specialties = DENTAL_SPECIALTIES.filter((s) => s.key !== 'general_dentistry').map((s) => ({ key: s.key, name: s.name }));
  const day = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Courses</span>
      </nav>
      <header className="tl-page__header">
        <h1>Courses</h1>
        <p className="tl-page__lead">
          What students see on your college page. <Link href={`/account/organizations/${id}/admissions`}>Admission enquiries</Link>
        </p>
      </header>

      <Card label="College profile">
        <CardHeader>
          <strong>College profile</strong>
          {profile?.recognitionVerifiedAt ? <Badge tone="success">Recognition checked</Badge> : profile?.recognitionBody ? <Badge tone="neutral">Recognition not checked yet</Badge> : null}
        </CardHeader>
        <CardBody>
          <CollegeProfileForm
            organizationId={id}
            profile={{
              ownership: profile?.ownership ?? '',
              affiliatedUniversity: profile?.affiliatedUniversity ?? '',
              establishedYear: profile?.establishedYear ? String(profile.establishedYear) : '',
              recognitionBody: profile?.recognitionBody ?? '',
              recognitionReference: profile?.recognitionReference ?? '',
              admissionsEmail: profile?.admissionsEmail ?? '',
              admissionsPhone: profile?.admissionsPhone ?? '',
            }}
          />
        </CardBody>
      </Card>

      <Card label="Courses">
        <CardHeader>
          <strong>Courses</strong>
        </CardHeader>
        <CardBody>
          {courses.length === 0 ? <EmptyState title="No courses yet" description="Add your first course below. It stays a draft until you publish it." /> : null}
          <ul className="tl-list" aria-label="Courses">
            {courses.map((c) => (
              <li key={c.id} className="tl-stack">
                <div className="tl-card__title-row">
                  <strong>{c.name}</strong>
                  <Badge tone={c.status === 'PUBLISHED' ? 'success' : c.status === 'DRAFT' ? 'warning' : 'neutral'}>{c.status.toLowerCase()}</Badge>
                </div>
                <span className="tl-list__meta">
                  {LEVEL_LABEL[c.level]}
                  {c.specialtyKey ? ` · ${specialtyName(c.specialtyKey)}` : ''} · {c.durationMonths} months · {c.seats ?? '—'} seats · {c.annualFeeMinor !== null && c.currency ? `${formatMoney({ amountMinor: c.annualFeeMinor, currency: c.currency }, 'en-IN')} a year` : 'fee not given'} · {EXAM_LABEL[c.entranceExam]} · {c._count.enquiries} enquiries
                </span>
                {c.cycles.length > 0 ? (
                  <span className="tl-list__meta">Admission windows: {c.cycles.map((y) => `${y.academicYear} (${day(y.opensOn)} → ${day(y.closesOn)}${y.seats ? `, ${y.seats} seats` : ''})`).join(' · ')}</span>
                ) : (
                  <span className="tl-list__meta">No admission window yet.</span>
                )}
                <CourseEditor
                  course={{
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    seats: c.seats === null ? '' : String(c.seats),
                    feeRupees: c.annualFeeMinor === null ? '' : String(Number(c.annualFeeMinor) / 100),
                    description: c.description ?? '',
                  }}
                />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card label="Add a course">
        <CardHeader>
          <strong>Add a course</strong>
        </CardHeader>
        <CardBody>
          <NewCourseForm organizationId={id} specialties={specialties} currency={organization.currency} />
        </CardBody>
      </Card>
    </div>
  );
}
