/**
 * TL-PAGE-ORG-POSTING-001 — /account/organizations/:id/careers/:postingId
 *
 * One posting from the employer's side: publish, close or mark filled; edit;
 * and its applications — contact details and résumé while each stands, the
 * applicant's note, moves and internal notes. Opening the list is audited.
 * 404 for anyone who may not read the organization's applications.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { postingApplications } from '@/platform/careers/service';
import { listDistricts } from '@/platform/india-data/districts';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { APPLICATION_STATUS_LABEL, JOB_KIND_LABEL, POSTING_STATUS_LABEL } from '@/platform/careers/labels';
import { isAppError } from '@/platform/kernel/errors';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { PostingForm } from '@/components/careers/posting-form';
import { PostingStatus } from '@/components/careers/posting-status';
import { ApplicationActions } from '@/components/careers/application-actions';
import { OpenFileButton } from '@/components/records/open-file-button';

export const metadata: Metadata = { title: 'Applications', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OrgPostingPage({ params }: { params: Promise<{ id: string; postingId: string }> }) {
  const { id, postingId } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await postingApplications(principal, postingId).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data || data.posting.organizationId !== id) notFound();
  const { posting: p } = data;
  const districts = data.canEdit ? (await listDistricts({ countryCode: 'IN' })).map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` })) : [];
  const today = new Date().toISOString().slice(0, 10);
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const closesOn = p.closesAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(p.closesAt) : '';

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}/careers`}>Careers</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{p.title}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{p.title}</h1>
          <Badge tone="neutral">{JOB_KIND_LABEL[p.kind]}</Badge>
          <Badge tone={p.status === 'OPEN' ? 'success' : 'neutral'}>{POSTING_STATUS_LABEL[p.status]}</Badge>
        </div>
        {p.status === 'OPEN' ? (
          <p className="tl-page__lead">
            Public at <Link href={`/careers/${p.id}`}>its careers page</Link>.
          </p>
        ) : null}
      </header>
      {data.canEdit && p.status !== 'FILLED' ? <PostingStatus postingId={p.id} status={p.status} /> : null}

      <Card label="Applications">
        <CardHeader>
          <strong>Applications</strong>
        </CardHeader>
        <CardBody>
          {data.applications.length === 0 ? (
            <EmptyState title="No applications yet" description={p.status === 'OPEN' ? 'They appear here as people apply.' : 'Publish the posting to receive applications.'} />
          ) : (
            <ul className="tl-list" aria-label="Applications">
              {data.applications.map((a) => (
                <li key={a.id} className="tl-stack" aria-label={a.applicant.displayName ?? 'Applicant'}>
                  <div className="tl-card__title-row">
                    <strong>{a.applicant.displayName ?? 'Applicant'}</strong>
                    <Badge tone={a.status === 'SUBMITTED' ? 'info' : a.status === 'HIRED' || a.status === 'OFFERED' ? 'success' : 'neutral'}>{APPLICATION_STATUS_LABEL[a.status]}</Badge>
                  </div>
                  <span className="tl-list__meta">
                    Applied {date(a.createdAt)}
                    {a.applicant.email ? (
                      <>
                        {' · '}
                        <a href={`mailto:${a.applicant.email}`}>{a.applicant.email}</a>
                      </>
                    ) : null}
                    {a.applicant.phone ? (
                      <>
                        {' · '}
                        <a href={`tel:${a.applicant.phone}`}>{a.applicant.phone}</a>
                      </>
                    ) : null}
                    {a.status === 'INTERVIEW' && a.interviewAt ? ` · interview ${when(a.interviewAt)}` : ''}
                  </span>
                  {a.status === 'WITHDRAWN' ? <p className="tl-muted" style={{ margin: 0 }}>Withdrawn — their details and résumé are no longer shared with you.</p> : null}
                  {a.coverNote ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{a.coverNote}</p> : null}
                  {a.resumeFile && a.resumeFile.status === 'ACTIVE' ? <OpenFileButton fileId={a.resumeFile.id} label={`Open résumé (${a.resumeFile.originalFilename ?? 'file'})`} /> : null}
                  {data.canManage && a.status !== 'WITHDRAWN' ? <ApplicationActions applicationId={a.id} status={a.status} employerNote={a.employerNote ?? ''} /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {data.canEdit && p.status !== 'FILLED' ? (
        <Card label="Edit posting">
          <CardHeader>
            <strong>Edit posting</strong>
          </CardHeader>
          <CardBody>
            <PostingForm
              organizationId={id}
              postingId={p.id}
              initial={{
                kind: p.kind,
                role: p.role,
                employmentType: p.employmentType,
                title: p.title,
                description: p.description,
                requirements: p.requirements ?? '',
                specialtyKey: p.specialtyKey ?? '',
                districtId: p.districtId ?? '',
                city: p.city ?? '',
                payMin: p.payMinMinor != null ? String(p.payMinMinor / 100) : '',
                payMax: p.payMaxMinor != null ? String(p.payMaxMinor / 100) : '',
                openings: String(p.openings),
                closesOn,
              }}
              districts={districts}
              specialties={DENTAL_SPECIALTIES.map((s) => ({ key: s.key, name: s.name }))}
              today={today}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
