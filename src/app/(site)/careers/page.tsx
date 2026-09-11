/**
 * TL-PAGE-CAREERS-001 — /careers
 *
 * Jobs and internships at Toothlogy-verified dental organizations. A plain GET
 * form (works without JavaScript): search, kind, role, district. Not indexed
 * while nothing is open.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPostings } from '@/platform/careers/service';
import { listDistricts } from '@/platform/india-data/districts';
import { EMPLOYMENT_TYPE_LABEL, JOB_KIND_LABEL, JOB_KINDS, JOB_ROLE_LABEL, JOB_ROLES, payText } from '@/platform/careers/labels';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const dynamic = 'force-dynamic';

const DESCRIPTION = 'Jobs and internships for dentists, specialists, students, assistants and technicians at dental organizations Toothlogy has verified.';

export async function generateMetadata(): Promise<Metadata> {
  const { total } = await listPostings({});
  return { title: 'Dental jobs and internships', description: DESCRIPTION, alternates: { canonical: '/careers' }, robots: total > 0 ? { index: true, follow: true } : { index: false, follow: true } };
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);

export default async function CareersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = one(sp.q)?.slice(0, 100).trim() || undefined;
  const kind = JOB_KINDS.some(([k]) => k === one(sp.kind)) ? (one(sp.kind) as 'JOB' | 'INTERNSHIP') : undefined;
  const role = JOB_ROLES.some(([k]) => k === one(sp.role)) ? (one(sp.role) as (typeof JOB_ROLES)[number][0]) : undefined;
  const districts = await listDistricts({ countryCode: 'IN' });
  const districtId = districts.some((d) => d.id === one(sp.district)) ? one(sp.district) : undefined;
  const page = Math.min(200, Math.max(1, Number(one(sp.page)) || 1));
  const { items, total, pages } = await listPostings({ q, kind, role, districtId, page });
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(d);
  const href = (p: number) => `/careers?${new URLSearchParams({ ...(q ? { q } : {}), ...(kind ? { kind } : {}), ...(role ? { role } : {}), ...(districtId ? { district: districtId } : {}), page: String(p) }).toString()}`;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '56rem' }}>
      <header className="tl-page__header">
        <h1>Dental jobs and internships</h1>
        <p className="tl-page__lead">{DESCRIPTION} Apply through Toothlogy; your details go only to the employer you apply to.</p>
      </header>
      <form method="get" action="/careers" className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} role="search">
        <label className="tl-stack">
          <span>Search</span>
          <input className="tl-input" type="search" name="q" defaultValue={q} maxLength={100} placeholder="e.g. orthodontist, Raipur" />
        </label>
        <label className="tl-stack">
          <span>Kind</span>
          <select className="tl-input" name="kind" defaultValue={kind ?? ''}>
            <option value="">All</option>
            {JOB_KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-stack">
          <span>Role</span>
          <select className="tl-input" name="role" defaultValue={role ?? ''}>
            <option value="">All</option>
            {JOB_ROLES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="tl-stack">
          <span>District</span>
          <select className="tl-input" name="district" defaultValue={districtId ?? ''}>
            <option value="">All</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}, {d.state}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="tl-button tl-button--primary">
          <span>Search</span>
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState title={q || kind || role || districtId ? 'Nothing matches' : 'No openings right now'} description={q || kind || role || districtId ? 'Try fewer filters.' : 'Openings appear here when verified dental organizations post them.'} />
      ) : (
        <ul className="tl-list" aria-label="Openings">
          {items.map((p) => {
            const pay = payText(p.payMinMinor, p.payMaxMinor, p.kind);
            const place = [p.city, p.district?.name].filter(Boolean).join(', ');
            return (
              <li key={p.id}>
                <Card label={p.title}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <Link href={`/careers/${p.id}`}>
                          <strong>{p.title}</strong>
                        </Link>
                        <Badge tone="neutral">{JOB_KIND_LABEL[p.kind]}</Badge>
                      </div>
                      <span>{p.organization.name}</span>
                      <span className="tl-list__meta">
                        {JOB_ROLE_LABEL[p.role]} · {EMPLOYMENT_TYPE_LABEL[p.employmentType]}
                        {place ? ` · ${place}` : ''}
                        {pay ? ` · ${pay}` : ''}
                        {p.closesAt ? ` · closes ${date(p.closesAt)}` : ''}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : null}
          <span className="tl-muted">
            Page {page} of {pages} · {total} openings
          </span>
          {page < pages ? <Link href={href(page + 1)}>Next</Link> : null}
        </nav>
      ) : null}
      <p className="tl-muted">
        Hiring? Post from your organization’s page under <Link href="/account/organizations">Organizations</Link>. Publishing needs a verified organization.
      </p>
    </div>
  );
}
