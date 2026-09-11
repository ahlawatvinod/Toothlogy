/**
 * TL-PAGE-ORG-CAREERS-001 — /account/organizations/:id/careers
 *
 * The organization's jobs and internships with applications counted, and a
 * new posting. Prepare postings any time; publishing needs verification.
 * 404 for anyone who may neither manage postings nor read applications.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { organizationPostings } from '@/platform/careers/service';
import { listDistricts } from '@/platform/india-data/districts';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { JOB_KIND_LABEL, POSTING_STATUS_LABEL } from '@/platform/careers/labels';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';
import { PostingForm } from '@/components/careers/posting-form';

export const metadata: Metadata = { title: 'Careers', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function OrgCareersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) notFound();
  const data = await organizationPostings(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!data) notFound();
  const districts = data.canManage ? (await listDistricts({ countryCode: 'IN' })).map((d) => ({ id: d.id, label: `${d.name}, ${d.state}` })) : [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="tl-page">
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href={`/account/organizations/${id}`}>{data.organization.name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Careers</span>
      </nav>
      <header className="tl-page__header">
        <h1>Careers</h1>
        <p className="tl-page__lead">
          Your jobs and internships on <Link href="/careers">Toothlogy careers</Link>. Applicants apply through Toothlogy and share their details only with you.
        </p>
      </header>
      {!data.organization.verifiedAt ? <Alert tone="warning">You can prepare postings now. Publishing them needs your organization to be verified — ask on your organization page.</Alert> : null}
      {data.postings.length === 0 ? (
        <EmptyState title="No postings yet" description="Post a job or internship below." />
      ) : (
        <ul className="tl-list" aria-label="Postings">
          {data.postings.map((p) => (
            <li key={p.id}>
              <div className="tl-card__title-row">
                <Link href={`/account/organizations/${id}/careers/${p.id}`}>
                  <strong>{p.title}</strong>
                </Link>
                <Badge tone="neutral">{JOB_KIND_LABEL[p.kind]}</Badge>
                <Badge tone={p.status === 'OPEN' ? 'success' : 'neutral'}>{POSTING_STATUS_LABEL[p.status]}</Badge>
              </div>
              <span className="tl-list__meta">
                {p.applications.total} applications{p.applications.waiting ? ` · ${p.applications.waiting} new` : ''}
                {p.district ? ` · ${p.district.name}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.canManage ? (
        <Card label="Post a job or internship">
          <CardHeader>
            <strong>Post a job or internship</strong>
          </CardHeader>
          <CardBody>
            <PostingForm
              organizationId={id}
              initial={{ kind: 'JOB', role: 'DENTIST', employmentType: 'FULL_TIME', title: '', description: '', requirements: '', specialtyKey: '', districtId: '', city: '', payMin: '', payMax: '', openings: '1', closesOn: '' }}
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
