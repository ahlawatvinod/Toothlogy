/**
 * TL-PAGE-ACADEMICS-001 — /academics
 *
 * Public researcher and faculty profiles, by type and interest, with the
 * college posts that were confirmed.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicAcademics } from '@/platform/academic/service';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = { title: 'Researchers and faculty', description: 'Dental researchers and faculty members, their interests and publications.' };
export const dynamic = 'force-dynamic';

const SPECIALTY = new Map(DENTAL_SPECIALTIES.map((s) => [s.key, s.name]));

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const type = sp.type === 'RESEARCHER' || sp.type === 'FACULTY' ? sp.type : undefined;
  const interest = typeof sp.interest === 'string' && SPECIALTY.has(sp.interest) ? sp.interest : undefined;
  const people = await listPublicAcademics({ type, interest });
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, interest, ...next })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/academics?${s}` : '/academics';
  };

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Researchers and faculty</h1>
        <p className="tl-page__lead">
          Profiles their owners made public. <Link href="/account/academic">Create yours</Link>
        </p>
      </header>
      <nav aria-label="Type" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {([undefined, 'RESEARCHER', 'FACULTY'] as const).map((t) => (
          <Link key={t ?? 'all'} href={href({ type: t })} aria-current={type === t ? 'page' : undefined} className={`tl-button tl-button--sm ${type === t ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>{t === 'RESEARCHER' ? 'Researchers' : t === 'FACULTY' ? 'Faculty' : 'Everyone'}</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Interest" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href={href({ interest: undefined })} aria-current={!interest ? 'page' : undefined} className={`tl-button tl-button--sm ${!interest ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
          <span>All interests</span>
        </Link>
        {DENTAL_SPECIALTIES.map((s) => (
          <Link key={s.key} href={href({ interest: s.key })} aria-current={interest === s.key ? 'page' : undefined} className={`tl-button tl-button--sm ${interest === s.key ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>{s.name}</span>
          </Link>
        ))}
      </nav>
      {people.length === 0 ? (
        <EmptyState title="No profiles here yet" description="Profiles appear when their owners make them public." />
      ) : (
        <ul className="tl-list" aria-label="Profiles">
          {people.map((p) => (
            <li key={p.id}>
              <Card label={p.displayName ?? 'Profile'}>
                <CardBody>
                  <div className="tl-stack">
                    <div className="tl-card__title-row">
                      <Link href={`/${p.type === 'FACULTY' ? 'faculty' : 'researchers'}/${p.slug}`}>
                        <strong>{p.displayName}</strong>
                      </Link>
                      <Badge tone="neutral">{p.type === 'FACULTY' ? 'Faculty' : 'Researcher'}</Badge>
                    </div>
                    {p.headline ? <span className="tl-list__meta">{p.headline}</span> : null}
                    <span className="tl-list__meta">
                      {p.facultyAppointments.map((f) => `${f.designation}, ${f.organization.name}`).join(' · ') || [p.academic?.designation, p.academic?.institution].filter(Boolean).join(', ') || '—'}
                      {' · '}
                      {p._count.publications} publication{p._count.publications === 1 ? '' : 's'}
                    </span>
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
