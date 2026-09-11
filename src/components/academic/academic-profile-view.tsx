/**
 * A public researcher or faculty profile. Everything is labelled as the
 * person's own statement except what someone else confirmed: a faculty post
 * the college confirmed, and a dentist's verification.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicAcademic, type AcademicType } from '@/platform/academic/service';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { Badge, Card, CardBody, CardHeader, EmptyState } from '@/design-system';

const SPECIALTY = new Map(DENTAL_SPECIALTIES.map((s) => [s.key, s.name]));
const LABEL: Record<AcademicType, string> = { RESEARCHER: 'Researcher', FACULTY: 'Faculty' };

export async function academicMetadata(type: AcademicType, slug: string): Promise<Metadata> {
  const profile = await getPublicAcademic(type, slug);
  if (!profile) return { title: 'Profile not found', robots: { index: false, follow: false } };
  return { title: `${profile.displayName ?? LABEL[type]} — ${LABEL[type].toLowerCase()}`, description: profile.headline ?? undefined };
}

export async function AcademicProfileView({ type, slug }: { type: AcademicType; slug: string }) {
  const profile = await getPublicAcademic(type, slug);
  if (!profile) notFound();
  const a = profile.academic;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/academics">Researchers and faculty</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{profile.displayName}</span>
      </nav>
      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{profile.displayName}</h1>
          <Badge tone="neutral">{LABEL[type]}</Badge>
          {profile.verifiedDentist ? <Badge tone="success">Verified dentist</Badge> : null}
        </div>
        {profile.headline ? <p className="tl-page__lead">{profile.headline}</p> : null}
      </header>

      <Card label="About">
        <CardBody>
          <dl className="tl-kv">
            {profile.facultyAppointments.length > 0 ? (
              <div>
                <dt>Faculty at</dt>
                <dd>
                  {profile.facultyAppointments.map((f) => (
                    <div key={f.id}>
                      {f.designation}
                      {f.department ? `, ${f.department}` : ''} — <Link href={`/colleges/${f.organization.slug}`}>{f.organization.name}</Link> <span className="tl-muted">(confirmed by the college)</span>
                    </div>
                  ))}
                </dd>
              </div>
            ) : null}
            {a?.designation || a?.institution ? (
              <div>
                <dt>Position</dt>
                <dd>{[a.designation, a.department, a.institution].filter(Boolean).join(', ')}</dd>
              </div>
            ) : null}
            {a?.interests.length ? (
              <div>
                <dt>Interests</dt>
                <dd>{a.interests.map((k) => SPECIALTY.get(k) ?? k).join(', ')}</dd>
              </div>
            ) : null}
            {a?.orcid ? (
              <div>
                <dt>ORCID</dt>
                <dd>
                  <a href={`https://orcid.org/${a.orcid}`} rel="noopener nofollow" target="_blank">
                    {a.orcid}
                  </a>
                </dd>
              </div>
            ) : null}
            {a?.website ? (
              <div>
                <dt>Website</dt>
                <dd>
                  <a href={a.website} rel="noopener nofollow" target="_blank">
                    {a.website.replace(/^https?:\/\//, '')}
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.verifiedDentist?.listed ? (
              <div>
                <dt>Sees patients</dt>
                <dd>
                  <Link href={`/dentists/${profile.verifiedDentist.slug}`}>Dentist profile and booking</Link>
                </dd>
              </div>
            ) : null}
          </dl>
          {profile.bio ? <p style={{ whiteSpace: 'pre-wrap' }}>{profile.bio}</p> : null}
          <p className="tl-muted" style={{ margin: 0 }}>
            Details and publications are as stated by {profile.displayName}; Toothlogy has not checked them.
          </p>
        </CardBody>
      </Card>

      <Card label="Publications">
        <CardHeader>
          <strong>Publications ({profile.publications.length})</strong>
        </CardHeader>
        <CardBody>
          {profile.publications.length === 0 ? (
            <EmptyState title="No publications listed" description="None listed yet." />
          ) : (
            <ol className="tl-list" aria-label="Publications">
              {profile.publications.map((p) => (
                <li key={p.id}>
                  <strong>{p.title}</strong>
                  <div className="tl-list__meta">
                    {[p.venue, p.year].filter(Boolean).join(', ')}
                    {p.doi ? (
                      <>
                        {' · '}
                        <a href={`https://doi.org/${p.doi}`} rel="noopener nofollow" target="_blank">
                          doi:{p.doi}
                        </a>
                      </>
                    ) : p.url ? (
                      <>
                        {' · '}
                        <a href={p.url} rel="noopener nofollow" target="_blank">
                          link
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
