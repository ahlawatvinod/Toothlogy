/**
 * TL-PAGE-COLLEGE-001 — /colleges/:slug
 *
 * A dental college: profile, recognition (the college's statement unless
 * Toothlogy checked it), published courses with fee, seats, entrance exam
 * and admission window, and the enquiry form.
 *
 * - An unclaimed listing says so and shows no courses: nobody answers for it.
 * - Only signed-in students with a verified email can enquire; the form says
 *   what to do otherwise instead of failing on submit.
 * - Indexable only when the college is verified, as for clinics.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { admissionsToday, cycleState, EXAM_LABEL, getPublicCollege, LEVEL_LABEL, specialtyName } from '@/platform/education/colleges';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { formatMoney } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { confirmedFaculty } from '@/platform/academic/service';
import { EnquiryForm } from './enquiry-form';

export const dynamic = 'force-dynamic';

const OWNERSHIP: Record<string, string> = { GOVERNMENT: 'Government', PRIVATE: 'Private', DEEMED_UNIVERSITY: 'Deemed university', AUTONOMOUS: 'Autonomous' };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const college = await getPublicCollege((await params).slug);
  if (!college) return { title: 'College not found', robots: { index: false, follow: false } };
  return {
    title: college.name,
    description: `${college.name}: dental courses, fees, seats, entrance exams and admission windows.`,
    robots: college.isVerified ? undefined : { index: false, follow: true },
  };
}

export default async function CollegePage({ params }: { params: Promise<{ slug: string }> }) {
  const college = await getPublicCollege((await params).slug);
  if (!college) notFound();
  const faculty = await confirmedFaculty(college.id);
  const principal = await currentPrincipal();
  const viewer = isAuthenticated(principal)
    ? {
        emailVerifiedAt: (await db().user.findUnique({ where: { id: principal.userId }, select: { emailVerifiedAt: true } }))?.emailVerifiedAt ?? null,
        isMember: (await db().organizationMember.count({ where: { organizationId: college.id, userId: principal.userId, leftAt: null } })) > 0,
      }
    : null;
  const today = admissionsToday();
  const profile = college.collegeProfile;
  const place = college.locations[0];
  const fee = (minor: bigint | null, currency: string | null) => (minor !== null && currency ? `${formatMoney({ amountMinor: minor, currency }, 'en-IN')} a year` : 'Ask the college');
  const windowLabel = (cycles: (typeof college.courses)[number]['cycles']) => {
    const cycle = cycles[0];
    if (!cycle) return 'Not announced';
    const state = cycleState(cycle, today);
    const d = (x: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(x);
    return `${cycle.academicYear}: ${state === 'OPEN' ? 'open until' : state === 'UPCOMING' ? `opens ${d(cycle.opensOn)}, closes` : 'closed'} ${state === 'CLOSED' ? '' : d(cycle.closesOn)}`.trim();
  };

  return (
    <div className="tl-container tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/colleges">Dental colleges</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{college.name}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{college.name}</h1>
          {college.isVerified ? <Badge tone="success">Verified</Badge> : null}
        </div>
        <p className="tl-page__lead">
          {[place?.address?.locality, place?.district?.name, place?.district?.region.name].filter(Boolean).join(', ')}
          {profile?.ownership ? ` · ${OWNERSHIP[profile.ownership]}` : ''}
          {profile?.establishedYear ? ` · since ${profile.establishedYear}` : ''}
        </p>
      </header>

      {!college.isClaimed ? (
        <Card label="Unclaimed listing">
          <CardBody>
            <p style={{ margin: 0 }}>
              Toothlogy listed this college from public records. Nobody from the college manages this page yet, so it shows no courses. <Link href="/for-clinics">Work here? Claim it.</Link>
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card label="About">
        <CardHeader>
          <strong>About</strong>
        </CardHeader>
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Affiliated university</dt>
              <dd>{profile?.affiliatedUniversity ?? 'Not given'}</dd>
            </div>
            <div>
              <dt>Recognition</dt>
              <dd>
                {profile?.recognitionBody ? `${profile.recognitionBody}${profile.recognitionReference ? ` (${profile.recognitionReference})` : ''}` : 'Not given'}
                {profile?.recognitionBody ? <div className="tl-muted">{college.recognitionVerified ? 'Checked by Toothlogy against the regulator’s list.' : 'As stated by the college; not checked by Toothlogy.'}</div> : null}
              </dd>
            </div>
            {profile?.admissionsEmail || profile?.admissionsPhone ? (
              <div>
                <dt>Admissions office</dt>
                <dd>{[profile.admissionsPhone, profile.admissionsEmail].filter(Boolean).join(' · ')}</dd>
              </div>
            ) : null}
            {college.website ? (
              <div>
                <dt>Website</dt>
                <dd>
                  <a href={college.website} rel="nofollow noopener" target="_blank">
                    {college.website.replace(/^https?:\/\//, '')}
                  </a>
                </dd>
              </div>
            ) : null}
          </dl>
          {college.description ? <p>{college.description}</p> : null}
        </CardBody>
      </Card>

      <Card label="Courses">
        <CardHeader>
          <strong>Courses</strong>
        </CardHeader>
        <CardBody>
          {college.courses.length === 0 ? (
            <EmptyState title="No courses published" description={college.isClaimed ? 'The college has not published its courses yet.' : 'Courses appear once the college manages this page.'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table caption="Published courses">
                <thead>
                  <tr>
                    <th scope="col">Course</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Fee</th>
                    <th scope="col">Entrance</th>
                    <th scope="col">Admission</th>
                  </tr>
                </thead>
                <tbody>
                  {college.courses.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <div className="tl-muted">
                          {LEVEL_LABEL[c.level]}
                          {c.specialtyKey ? ` · ${specialtyName(c.specialtyKey)}` : ''}
                        </div>
                      </td>
                      <td>{c.durationMonths % 12 === 0 ? `${c.durationMonths / 12} years` : `${c.durationMonths} months`}</td>
                      <td>{c.cycles[0]?.seats ?? c.seats ?? '—'}</td>
                      <td>{fee(c.annualFeeMinor, c.currency)}</td>
                      <td>{EXAM_LABEL[c.entranceExam]}</td>
                      <td>{windowLabel(c.cycles)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          <p className="tl-muted">Fees, seats and dates are the college’s own figures. Confirm them with the college before you apply.</p>
        </CardBody>
      </Card>

      {faculty.length > 0 ? (
        <Card label="Faculty">
          <CardHeader>
            <strong>Faculty</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {faculty.map((f) => (
                <li key={f.id}>
                  <Link href={`/faculty/${f.profile.slug}`}>{f.profile.displayName}</Link> — {f.designation}
                  {f.department ? `, ${f.department}` : ''}
                </li>
              ))}
            </ul>
            <p className="tl-muted" style={{ marginBottom: 0 }}>Posts confirmed by the college.</p>
          </CardBody>
        </Card>
      ) : null}

      {college.courses.length > 0 ? (
        <Card label="Ask about a course">
          <CardHeader>
            <strong>Ask about a course</strong>
          </CardHeader>
          <CardBody>
            {!viewer ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/colleges/${college.slug}`}>Sign in</Link> or <Link href="/register">create an account</Link> to ask the college about a course.
              </p>
            ) : !viewer.emailVerifiedAt ? (
              <p style={{ margin: 0 }}>Verify your email address first, so the college can reply to you. Look for the link we sent, or ask for a new one on your account page.</p>
            ) : viewer.isMember ? (
              <p style={{ margin: 0 }}>You work at this college, so you cannot enquire about its courses.</p>
            ) : (
              <EnquiryForm collegeName={college.name} courses={college.courses.map((c) => ({ id: c.id, label: `${c.name} (${LEVEL_LABEL[c.level]})`, exam: c.entranceExam }))} />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
