/**
 * TL-PAGE-CAMPS-001 — /camps
 *
 * Upcoming dental camps Toothlogy staff approved, by state: date, venue,
 * district, confirmed doctors and seats. Nothing unapproved is shown.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicCamps } from '@/platform/camps/service';
import { db } from '@/platform/db/client';
import { Badge, Card, CardBody, EmptyState } from '@/design-system';

export const metadata: Metadata = {
  title: 'Dental camps',
  description: 'Free dental check-up and awareness camps near you, with the dentists serving at each.',
};
export const dynamic = 'force-dynamic';

export default async function CampsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const regionId = typeof sp.state === 'string' && sp.state ? sp.state : undefined;
  const [camps, regions] = await Promise.all([
    listPublicCamps({ regionId }),
    db().region.findMany({ where: { countryCode: 'IN', districts: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page">
      <header className="tl-page__header">
        <h1>Dental camps</h1>
        <p className="tl-page__lead">Check-ups and awareness camps run with verified dentists. Every camp here was reviewed by Toothlogy before it was listed.</p>
      </header>
      {regions.length > 1 ? (
        <nav aria-label="State" className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <Link href="/camps" aria-current={!regionId ? 'page' : undefined} className={`tl-button tl-button--sm ${!regionId ? 'tl-button--primary' : 'tl-button--ghost'}`}>
            <span>All states</span>
          </Link>
          {regions.map((r) => (
            <Link key={r.id} href={`/camps?state=${r.id}`} aria-current={regionId === r.id ? 'page' : undefined} className={`tl-button tl-button--sm ${regionId === r.id ? 'tl-button--primary' : 'tl-button--ghost'}`}>
              <span>{r.name}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      {camps.length === 0 ? (
        <EmptyState title="No upcoming camps" description={regionId ? 'None planned in this state yet.' : 'Camps appear here once they are approved.'} />
      ) : (
        <ul className="tl-list" aria-label="Upcoming dental camps">
          {camps.map((c) => {
            const seatsLeft = c.capacity === null ? null : Math.max(0, c.capacity - c._count.registrations);
            return (
              <li key={c.id}>
                <Card label={c.title}>
                  <CardBody>
                    <div className="tl-stack">
                      <div className="tl-card__title-row">
                        <Link href={`/camps/${c.slug}`}>
                          <strong>{c.title}</strong>
                        </Link>
                        {seatsLeft === 0 ? <Badge tone="warning">Full</Badge> : null}
                      </div>
                      <span className="tl-list__meta">
                        {when(c.startsAt)} · {c.venueName}, {c.district.name}, {c.district.region.name}
                      </span>
                      <span className="tl-list__meta">
                        {c._count.doctors} dentist{c._count.doctors === 1 ? '' : 's'} confirmed
                        {seatsLeft !== null ? ` · ${seatsLeft} place${seatsLeft === 1 ? '' : 's'} left` : ''}
                        {c.organization ? ` · by ${c.organization.name}` : ''}
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
