/**
 * TL-PAGE-CLINICPUBLIC-001 — /clinics/:slug
 *
 * The public page for a clinic: its branches, hours, holidays, services and
 * prices, facilities and the confirmed, verified dentists who practise there.
 *
 * Honesty rules it follows:
 * - The Verified badge appears only for a current (unexpired) verification.
 *   Otherwise the page says the details are the clinic's own statement.
 * - Facilities are labelled as stated by the clinic until verification.
 * - An unclaimed listing says so, rather than implying the clinic wrote it.
 * - Book links appear only for dentists taking bookings here; otherwise the
 *   page says so instead of offering a button that goes nowhere.
 * - Only verified clinics are indexable and carry structured data: publishing
 *   Dentist markup for an unchecked clinic would repeat an unverified claim to
 *   every search engine.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicClinic, type PublicClinic } from '@/platform/organizations/public';
import { nextAvailableSlot } from '@/platform/appointments/availability';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { recordSponsoredFollowUp, sponsoredForProfile } from '@/platform/sponsored/serve';
import { trackView } from '@/platform/analytics/events';
import { SponsoredCard } from '@/components/sponsored/sponsored-card';
import { FACILITY_BY_KEY } from '@/platform/catalogue/facilities';
import { TREATMENT_CATEGORY_LABELS } from '@/platform/catalogue/treatments';
import { directionsUrl } from '@/platform/location/reference-geocoder';
import { formatMoney, money } from '@/platform/money';
import { Badge, Card, CardBody, CardHeader, EmptyState, Table } from '@/design-system';
import { primeBadgeHolders } from '@/platform/prime/service';

export const dynamic = 'force-dynamic';

// Monday first: the week as Indian clinics print it on the door.
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TYPE_LABELS: Record<string, string> = { CLINIC: 'In clinic', VIDEO: 'Video', HOME_VISIT: 'Home visit' };

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

type Offering = PublicClinic['locations'][number]['offerings'][number];

function priceLabel(o: Offering): string {
  if (o.priceMinor === null || !o.currency) return 'Price on consultation';
  const from = formatMoney(money(BigInt(o.priceMinor), o.currency), 'en-IN');
  if (o.priceMaxMinor !== null && o.priceMaxMinor > o.priceMinor) {
    return `${from} – ${formatMoney(money(BigInt(o.priceMaxMinor), o.currency), 'en-IN')}`;
  }
  return from;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const clinic = await getPublicClinic(slug);
  if (!clinic) return { title: 'Clinic not found', robots: { index: false, follow: false } };

  const place = clinic.locations[0]?.address?.locality;
  const description =
    clinic.description ??
    `${clinic.name}${place ? ` in ${place}` : ''}: opening hours, services and prices, and the dentists who practise there.`;

  return {
    title: clinic.isVerified ? `${clinic.name} — verified clinic` : clinic.name,
    description,
    robots: clinic.isVerified ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: `/clinics/${clinic.slug}` },
    openGraph: { title: clinic.name, description, type: 'website' },
  };
}

export default async function PublicClinicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const clinic = await getPublicClinic(slug);
  if (!clinic) notFound();

  const principal = await currentPrincipal();
  // Counted for the practice's dashboard; the viewer is identified only with
  // their analytics consent.
  void trackView('clinic_viewed', 'organization', clinic.id, isAuthenticated(principal) ? principal.userId : null);
  const viewerUserId = isAuthenticated(principal) ? principal.userId : null;
  // Display only: a paid membership, labelled as such; ranking never reads it.
  const isPrime = (await primeBadgeHolders([clinic.id])).has(clinic.id);
  const spParam = (await searchParams).sp;
  const sp = typeof spParam === 'string' && /^[a-z]{3}_[0-9A-Z]{10,40}$/.test(spParam) ? spParam : null;
  if (sp) await recordSponsoredFollowUp(sp, 'PROFILE_VIEW', viewerUserId);
  const spSuffix = sp ? `&sp=${sp}` : '';
  const firstLocation = clinic.locations[0];
  const sponsored = await sponsoredForProfile({
    point: firstLocation && firstLocation.latitude !== null && firstLocation.longitude !== null ? { latitude: firstLocation.latitude, longitude: firstLocation.longitude } : null,
    excludeOrganizationId: clinic.id,
    excludePracticeIds: clinic.locations.flatMap((l) => l.dentists.map((d) => d.practiceId)),
    viewerUserId,
  }).catch(() => []);

  // A Book link only where the dentist has a genuinely free time now.
  const bookable = clinic.locations.flatMap((l) => l.dentists.filter((d) => !d.bookingPaused).map((d) => ({ location: l, dentist: d })));
  const nextSlots = new Map(await Promise.all(bookable.map(async ({ dentist }) => [dentist.practiceId, await nextAvailableSlot(dentist.practiceId).catch(() => null)] as const)));
  const slotLabel = (s: { localDate: string; localTime: string }) =>
    `${new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s.localDate}T00:00:00Z`))}, ${s.localTime}`;

  const structuredData = clinic.isVerified
    ? {
        '@context': 'https://schema.org',
        '@type': 'Dentist',
        name: clinic.name,
        description: clinic.description ?? undefined,
        url: clinic.website ?? undefined,
        telephone: clinic.phone ?? undefined,
        location: clinic.locations.map((l) => ({
          '@type': 'Place',
          name: l.name,
          address: l.address
            ? {
                '@type': 'PostalAddress',
                streetAddress: l.address.lines.join(', '),
                addressLocality: l.address.locality ?? undefined,
                addressRegion: l.address.regionName ?? undefined,
                postalCode: l.address.postalCode ?? undefined,
                addressCountry: l.address.countryCode,
              }
            : undefined,
          geo:
            l.latitude !== null && l.longitude !== null
              ? { '@type': 'GeoCoordinates', latitude: l.latitude, longitude: l.longitude }
              : undefined,
        })),
      }
    : null;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      {structuredData ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      ) : null}

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          {clinic.logoFileId ? (
            // A public file streamed by the files API.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/v1/files/${clinic.logoFileId}/public`} alt="" width={56} height={56} style={{ objectFit: 'contain' }} />
          ) : null}
          <h1>{clinic.name}</h1>
          {clinic.isVerified ? <Badge tone="success">Verified clinic</Badge> : <Badge tone="neutral">Not verified</Badge>}
          {isPrime ? (
            <span title="A paid Toothlogy membership. It does not change where the clinic appears in search.">
              <Badge tone="info">Prime member</Badge>
            </span>
          ) : null}
        </div>
        {clinic.description ? <p className="tl-page__lead">{clinic.description}</p> : null}
        {!clinic.isVerified ? (
          <p className="tl-muted">
            Toothlogy has not yet checked this clinic’s registration. Details on this page are as stated by the clinic.
          </p>
        ) : null}
        {!clinic.isClaimed ? (
          <p className="tl-muted">
            This listing was created from public information and has not been claimed by the clinic.{' '}
            <Link href={`/account/claim/${clinic.id}`}>Run this clinic? Claim this listing</Link>
          </p>
        ) : null}
        {clinic.website || clinic.phone ? (
          <p className="tl-muted">
            {clinic.phone ? <a href={`tel:${clinic.phone}`}>{clinic.phone}</a> : null}
            {clinic.phone && clinic.website ? ' · ' : null}
            {clinic.website ? (
              <a href={clinic.website} rel="noopener noreferrer nofollow" target="_blank">
                Website
              </a>
            ) : null}
          </p>
        ) : null}
      </header>

      <Card label="Booking">
        <CardHeader>
          <strong>Book an appointment</strong>
        </CardHeader>
        <CardBody>
          {bookable.length > 0 ? (
            <ul className="tl-list">
              {bookable.map(({ location: l, dentist: d }) => {
                const slot = nextSlots.get(d.practiceId);
                return (
                  <li key={d.practiceId} className="tl-stack">
                    <strong>
                      {d.name} · {l.name}
                    </strong>
                    {slot ? (
                      <span className="tl-inline">
                        <Link className="tl-button tl-button--primary tl-button--sm" href={`/book/${d.slug}?practice=${d.practiceId}&source=clinic_page${spSuffix}`}>
                          <span>Book</span>
                        </Link>
                        <span className="tl-muted">Next free clinic visit: {slotLabel(slot)}</span>
                      </span>
                    ) : (
                      <span className="tl-muted">
                        No free times in the next few weeks.{' '}
                        <Link href={`/book/${d.slug}?practice=${d.practiceId}&source=clinic_page${spSuffix}`}>Join the waitlist or ask for a call</Link>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tl-muted" style={{ margin: 0 }}>
              No dentist here takes online bookings yet. Call the clinic to book; opening hours are below.
            </p>
          )}
        </CardBody>
      </Card>

      {sponsored.length > 0 ? (
        <section aria-label="Sponsored" className="tl-stack">
          <h2 style={{ fontSize: 'var(--tl-text-base)', margin: 0 }}>Sponsored</h2>
          <p className="tl-muted" style={{ margin: 0 }}>
            Paid Prime placements for other practices nearby. They are not recommendations and do not affect search results.
          </p>
          {sponsored.map((s) => (
            <SponsoredCard key={s.impressionId} slot={s} />
          ))}
        </section>
      ) : null}

      {clinic.locations.map((l) => {
        const byDay = new Map<number, string[]>();
        for (const h of l.businessHours) {
          byDay.set(h.dayOfWeek, [...(byDay.get(h.dayOfWeek) ?? []), `${hhmm(h.opensAtMinutes)}–${hhmm(h.closesAtMinutes)}`]);
        }
        const closedToday = l.closures.find((c) => c.startsOn <= l.today && c.endsOn >= l.today);

        return (
          <section key={l.id} aria-labelledby={`branch-${l.id}`} className="tl-stack">
            <Card label={l.name}>
              <CardHeader>
                <div className="tl-card__title-row">
                  <h2 id={`branch-${l.id}`} style={{ margin: 0, fontSize: 'var(--tl-text-lg)' }}>
                    {l.name}
                  </h2>
                  {l.status === 'TEMPORARILY_CLOSED' ? <Badge tone="warning">Temporarily closed</Badge> : null}
                  {closedToday && l.status !== 'TEMPORARILY_CLOSED' ? (
                    <Badge tone="warning">Closed today{closedToday.reason ? ` — ${closedToday.reason}` : ''}</Badge>
                  ) : null}
                  {l.emergencyAvailable ? <Badge tone="info">Sees emergencies</Badge> : null}
                </div>
              </CardHeader>
              <CardBody>
                <div className="tl-stack">
                  {l.address ? (
                    <p style={{ margin: 0 }}>
                      {[l.address.lines.join(', '), l.address.locality, l.address.regionName, l.address.postalCode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  ) : (
                    <p className="tl-muted" style={{ margin: 0 }}>
                      Address not provided.
                    </p>
                  )}
                  <p className="tl-muted" style={{ margin: 0 }}>
                    {l.phone ? (
                      <>
                        <a href={`tel:${l.phone}`}>{l.phone}</a>
                        {' · '}
                      </>
                    ) : null}
                    {l.latitude !== null && l.longitude !== null ? (
                      <a href={directionsUrl({ latitude: l.latitude, longitude: l.longitude })} rel="noopener noreferrer" target="_blank">
                        Directions (opens Google Maps)
                      </a>
                    ) : (
                      'No map position yet'
                    )}
                  </p>

                  {/* With no published hours, "Closed" on every day would read as
                      "shut all week" — a different and false statement. */}
                  {l.businessHours.length > 0 ? (
                    <dl className="tl-kv">
                      {WEEK.map((d) => (
                        <div key={d}>
                          <dt>{DAY_NAMES[d]}</dt>
                          <dd>{byDay.get(d)?.join(', ') ?? 'Closed'}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="tl-muted" style={{ margin: 0 }}>
                      The clinic has not published opening hours. Call before visiting.
                    </p>
                  )}

                  {l.closures.length > 0 ? (
                    <div>
                      <strong>Upcoming closures</strong>
                      <ul className="tl-list">
                        {l.closures.map((c) => (
                          <li key={c.id}>
                            {c.startsOn === c.endsOn ? formatDay(c.startsOn) : `${formatDay(c.startsOn)} – ${formatDay(c.endsOn)}`}
                            {c.reason ? <span className="tl-list__meta"> {c.reason}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {l.facilities.length > 0 || l.wheelchairAccessible || l.parkingAvailable || l.homeVisitRadiusKm ? (
                    <div>
                      <strong>Facilities and access</strong>
                      {!clinic.isVerified ? <span className="tl-list__meta"> (as stated by the clinic)</span> : null}
                      <ul className="tl-list">
                        {l.facilities.map((f) => (
                          <li key={f}>{FACILITY_BY_KEY.get(f)?.label ?? f}</li>
                        ))}
                        {l.wheelchairAccessible ? <li>Wheelchair-accessible entrance and treatment room</li> : null}
                        {l.parkingAvailable ? <li>Parking available</li> : null}
                        {l.homeVisitRadiusKm ? <li>Home visits within {l.homeVisitRadiusKm} km</li> : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </CardBody>
            </Card>

            {l.photoFileIds.length > 0 ? (
              <ul aria-label={`Photos of ${l.name}`} className="tl-inline" style={{ flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
                {l.photoFileIds.map((photoId, index) => (
                  <li key={photoId}>
                    {/* A public file streamed by the files API. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/v1/files/${photoId}/public`} alt={`${l.name}, photo ${index + 1}`} width={200} height={150} loading="lazy" style={{ objectFit: 'cover', borderRadius: 'var(--tl-radius-md, 8px)', maxWidth: '100%', height: 'auto' }} />
                  </li>
                ))}
              </ul>
            ) : null}
            <Card label={`Services at ${l.name}`}>
              <CardHeader>
                <strong>Services and prices</strong>
              </CardHeader>
              <CardBody>
                {l.offerings.length === 0 ? (
                  <EmptyState title="No services listed" description="This branch has not published its services yet." />
                ) : (
                  <>
                    <Table caption={`Services and prices at ${l.name}`}>
                      <thead>
                        <tr>
                          <th scope="col">Treatment</th>
                          <th scope="col">Price</th>
                          <th scope="col">Time</th>
                          <th scope="col">Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.offerings.map((o) => (
                          <tr key={o.id}>
                            <td>
                              {o.name}
                              {o.dentistName ? <span className="tl-list__meta"> with {o.dentistName}</span> : null}
                              {o.category ? (
                                <span className="tl-list__meta">
                                  {' '}
                                  · {(TREATMENT_CATEGORY_LABELS as Record<string, string>)[o.category] ?? o.category}
                                </span>
                              ) : null}
                              {o.requiresConsultation ? <span className="tl-list__meta"> · consultation first</span> : null}
                            </td>
                            <td>{priceLabel(o)}</td>
                            <td>{o.durationMinutes ? `${o.durationMinutes} min` : '—'}</td>
                            <td>{o.appointmentTypes.map((t) => TYPE_LABELS[t] ?? t).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <p className="tl-muted" style={{ marginBlockEnd: 0 }}>
                      Prices are set by the clinic and may change after examination. Taxes, if any, are charged by the clinic.
                    </p>
                  </>
                )}
              </CardBody>
            </Card>

            {l.dentists.length > 0 ? (
              <Card label={`Dentists at ${l.name}`}>
                <CardHeader>
                  <strong>Dentists at {l.name}</strong>
                </CardHeader>
                <CardBody>
                  <ul className="tl-list">
                    {l.dentists.map((d) => (
                      <li key={d.slug}>
                        <Link href={`/dentists/${d.slug}`}>
                          <strong>{d.name}</strong>
                        </Link>{' '}
                        <Badge tone="success">Verified</Badge>
                        {d.headline ? <span className="tl-list__meta">{d.headline}</span> : null}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
