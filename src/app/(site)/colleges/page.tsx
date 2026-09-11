/**
 * TL-PAGE-COLLEGES-001 — /colleges
 *
 * Dental colleges with published courses, by level and state. Only colleges
 * someone has claimed appear: an unclaimed listing has nobody to publish or
 * answer for its courses. Recognition is labelled as the college's statement
 * unless Toothlogy has checked it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicColleges, LEVEL_LABEL, COURSE_LEVELS, specialtyName } from '@/platform/education/colleges';
import { db } from '@/platform/db/client';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = {
  title: 'Dental colleges',
  description: 'Dental colleges in India with their BDS and MDS courses, fees, seats, entrance exams and admission windows.',
};
export const dynamic = 'force-dynamic';

const OWNERSHIP: Record<string, string> = { GOVERNMENT: 'Government', PRIVATE: 'Private', DEEMED_UNIVERSITY: 'Deemed university', AUTONOMOUS: 'Autonomous' };

export default async function CollegesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const level = COURSE_LEVELS.find((l) => l === sp.level);
  const regionId = typeof sp.state === 'string' && sp.state ? sp.state : undefined;
  const [colleges, regions] = await Promise.all([
    listPublicColleges({ level, regionId }),
    db().region.findMany({ where: { countryCode: 'IN', districts: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const href = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ level, state: regionId, ...next })) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/colleges?${q}` : '/colleges';
  };

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Dental colleges</h1>
        <p className="tl-page__lead">Courses, fees, seats, entrance exams and admission windows, as each college publishes them. Ask a college about a course from its page.</p>
      </header>

      <nav aria-label="Course level" className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Link href={href({ level: undefined })} aria-current={!level ? 'page' : undefined} className={`tl-button tl-button--sm ${!level ? 'tl-button--primary' : 'tl-button--ghost'}`}>
          <span>All courses</span>
        </Link>
        {COURSE_LEVELS.map((l) => (
          <Link key={l} href={href({ level: l })} aria-current={level === l ? 'page' : undefined} className={`tl-button tl-button--sm ${level === l ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>{LEVEL_LABEL[l]}</span>
          </Link>
        ))}
      </nav>
      {regions.length > 1 ? (
        <nav aria-label="State" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <Link href={href({ state: undefined })} aria-current={!regionId ? 'page' : undefined} className={`tl-button tl-button--sm ${!regionId ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
            <span>All states</span>
          </Link>
          {regions.map((r) => (
            <Link key={r.id} href={href({ state: r.id })} aria-current={regionId === r.id ? 'page' : undefined} className={`tl-button tl-button--sm ${regionId === r.id ? 'tl-button--secondary' : 'tl-button--ghost'}`}>
              <span>{r.name}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {colleges.length === 0 ? (
        <EmptyState title="No colleges to show yet" description={level || regionId ? 'None match these filters.' : 'Colleges appear here once they publish their courses on Toothlogy.'} />
      ) : (
        <ul className="tl-list" aria-label="Dental colleges">
          {colleges.map((c) => {
            const place = c.locations[0];
            const levels = [...new Set(c.courses.map((k) => LEVEL_LABEL[k.level]))];
            const mds = c.courses.filter((k) => k.level === 'MDS').map((k) => specialtyName(k.specialtyKey)).filter(Boolean);
            return (
              <li key={c.id}>
                <Card label={c.name}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <Link href={`/colleges/${c.slug}`}>
                          <strong>{c.name}</strong>
                        </Link>
                        {c.collegeProfile?.recognitionVerifiedAt ? <Badge tone="success">Recognition checked</Badge> : <Badge tone="neutral">Recognition as stated</Badge>}
                      </div>
                      <span className="tl-list__meta">
                        {[place?.address?.locality, place?.district?.name, place?.district?.region.name].filter(Boolean).join(', ') || 'Location not given'}
                        {c.collegeProfile?.ownership ? ` · ${OWNERSHIP[c.collegeProfile.ownership]}` : ''}
                        {c.collegeProfile?.affiliatedUniversity ? ` · ${c.collegeProfile.affiliatedUniversity}` : ''}
                      </span>
                      <span className="tl-list__meta">
                        {levels.join(' · ')}
                        {mds.length ? ` — MDS in ${mds.join(', ')}` : ''}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
