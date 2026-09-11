/**
 * TL-PAGE-POSTING-001 — /careers/:id
 *
 * One job or internship: what it is, where, stated pay, closing date, the
 * description; and the application form for someone signed in (verified
 * email, résumé, consent). JobPosting structured data while it is open —
 * search engines are not told about closed ones. Drafts are not found.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { getPosting } from '@/platform/careers/service';
import { EMPLOYMENT_TYPE_LABEL, JOB_KIND_LABEL, JOB_ROLE_LABEL, payText } from '@/platform/careers/labels';
import { Alert, Badge, Card, CardBody, CardHeader } from '@/design-system';
import { ArticleBody } from '@/components/knowledge/article-body';
import { ApplyForm } from '@/components/careers/apply-form';

export const dynamic = 'force-dynamic';

const SCHEMA_TYPE: Readonly<Record<string, string>> = { FULL_TIME: 'FULL_TIME', PART_TIME: 'PART_TIME', VISITING: 'PER_DIEM', LOCUM: 'TEMPORARY', INTERNSHIP: 'INTERN' };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPosting(id);
  if (!p) return { title: 'Posting not found', robots: { index: false, follow: false } };
  return {
    title: `${p.title} — ${p.organization.name}`,
    description: p.description.slice(0, 160),
    alternates: { canonical: `/careers/${p.id}` },
    robots: p.accepting ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function PostingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getPosting(id);
  if (!p) notFound();
  const principal = await currentPrincipal();
  const signedIn = isAuthenticated(principal);
  const applied = signedIn ? await db().jobApplication.findUnique({ where: { postingId_applicantUserId: { postingId: p.id, applicantUserId: principal.userId } }, select: { createdAt: true, status: true } }) : null;
  const pay = payText(p.payMinMinor, p.payMaxMinor, p.kind);
  const place = [p.city, p.district?.name].filter(Boolean).join(', ');
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d);
  const structuredData = p.accepting
    ? {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: p.title,
        description: [p.description, p.requirements].filter(Boolean).join('\n\n'),
        datePosted: p.publishedAt?.toISOString(),
        ...(p.closesAt ? { validThrough: p.closesAt.toISOString() } : {}),
        employmentType: SCHEMA_TYPE[p.employmentType] ?? 'OTHER',
        hiringOrganization: { '@type': 'Organization', name: p.organization.name },
        jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', ...(p.city ? { addressLocality: p.city } : {}), ...(p.district ? { addressRegion: p.district.name } : {}), addressCountry: 'IN' } },
        ...(p.payMinMinor != null || p.payMaxMinor != null
          ? { baseSalary: { '@type': 'MonetaryAmount', currency: p.currency, value: { '@type': 'QuantitativeValue', ...(p.payMinMinor != null ? { minValue: p.payMinMinor / 100 } : {}), ...(p.payMaxMinor != null ? { maxValue: p.payMaxMinor / 100 } : {}), unitText: 'MONTH' } } }
          : {}),
        totalJobOpenings: p.openings,
      }
    : null;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      {structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /> : null}
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/careers">Jobs and internships</Link>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <Badge tone="neutral">{JOB_KIND_LABEL[p.kind]}</Badge>
          {p.organization.verifiedAt ? <Badge tone="success">verified organization</Badge> : null}
        </div>
        <h1>{p.title}</h1>
        <p className="tl-page__lead">{p.organization.name}</p>
      </header>
      {!p.accepting ? <Alert tone="info">{p.status === 'FILLED' ? 'This position has been filled.' : 'This posting is no longer accepting applications.'}</Alert> : null}
      <Card label="Details">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Role</dt>
              <dd>
                {JOB_ROLE_LABEL[p.role]} · {EMPLOYMENT_TYPE_LABEL[p.employmentType]}
              </dd>
            </div>
            {place ? (
              <div>
                <dt>Where</dt>
                <dd>{place}</dd>
              </div>
            ) : null}
            <div>
              <dt>{p.kind === 'INTERNSHIP' ? 'Stipend' : 'Pay'}</dt>
              <dd>{pay ? `${pay} (stated by the employer)` : 'Not stated'}</dd>
            </div>
            <div>
              <dt>Openings</dt>
              <dd>{p.openings}</dd>
            </div>
            {p.closesAt ? (
              <div>
                <dt>Closes</dt>
                <dd>{date(p.closesAt)}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>
      <section className="tl-stack" aria-label="About the role">
        <h2>About the role</h2>
        <ArticleBody text={p.description} />
        {p.requirements ? (
          <>
            <h2>Requirements</h2>
            <ArticleBody text={p.requirements} />
          </>
        ) : null}
      </section>
      {p.accepting ? (
        <Card label="Apply">
          <CardHeader>
            <strong>Apply</strong>
          </CardHeader>
          <CardBody>
            {!signedIn ? (
              <p style={{ margin: 0 }}>
                <Link href={`/login?next=/careers/${p.id}`}>Sign in</Link> or <Link href="/register">create an account</Link> to apply.
              </p>
            ) : applied ? (
              <p style={{ margin: 0 }}>
                You applied on {date(applied.createdAt)}. <Link href="/account/applications">See where it stands</Link>.
              </p>
            ) : (
              <ApplyForm postingId={p.id} employer={p.organization.name} />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
