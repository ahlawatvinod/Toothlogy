/**
 * TL-PAGE-FIND-001 — /find
 *
 * Dentist and clinic discovery over the search index. What it can show is
 * decided by the indexer, not here: only verified dentists confirmed at a
 * located branch, and only currently verified clinics.
 *
 * Built to work without JavaScript: the form is a plain GET, so every search
 * is a link. "Use my location" is the one enhancement, and it asks the browser
 * only when clicked.
 *
 * Honesty rules:
 * - Results are organic. Paid placement does not exist yet; when it does it
 *   arrives as separate hits with `promoted: true`, rendered with a
 *   "Sponsored" label — the badge below is already wired to that flag.
 * - A place typed into "near" resolves to a city centre unless a maps provider
 *   is configured, and the page says "approximate".
 * - Booking is not live; cards link to profiles, not to a fake "Book" button.
 * - Not indexable: result pages are thin and endlessly permuted.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { db } from '@/platform/db/client';
import { runSearch } from '@/platform/search/service';
import { geocode } from '@/platform/location/geocoding';
import { FIND_RADII, parseFindQuery, toSearchQuery } from '@/platform/discovery/find-query';
import { nextAvailableSlot } from '@/platform/appointments/availability';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { sponsoredForSearch } from '@/platform/sponsored/serve';
import { SponsoredCard } from '@/components/sponsored/sponsored-card';
import { formatMoney, money } from '@/platform/money';
import { LANGUAGES, LANGUAGE_BY_CODE } from '@/registry/globalization';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge, Card, CardBody, EmptyState, ErrorState } from '@/design-system';
import { UseMyLocation } from './use-my-location';
import { trackView } from '@/platform/analytics/events';

export const metadata: Metadata = {
  title: 'Find a dentist',
  description: 'Search verified dentists and clinics by treatment, specialty, language, fee and distance.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/find' },
};

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = { CLINIC: 'In clinic', VIDEO: 'Video', HOME_VISIT: 'Home visit' };

interface HitSource {
  title: string;
  summary: string | null;
  facets: Record<string, unknown> | null;
}

function km(metres: number | undefined): string | null {
  if (metres === undefined || metres === null) return null;
  return metres < 1000 ? `${Math.round(metres / 100) * 100} m away` : `${(metres / 1000).toFixed(1)} km away`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export default async function FindPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = parseFindQuery(params);

  // Only the form and the empty state need these, so they load while the
  // place is resolved and the search runs. The no-op catch marks the promise
  // handled until it is awaited below, where any error still surfaces.
  const lookups = Promise.all([
    db().specialty.findMany({ orderBy: { name: 'asc' }, select: { key: true, name: true } }),
    db().treatment.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { key: true, name: true } }),
    db().searchDocument.count({ where: { entityType: query.type, isPublished: true } }),
  ]);
  lookups.catch(() => undefined);

  // Resolve the centre: explicit coordinates win; otherwise geocode the place name.
  let centre = query.point;
  let placeNote: string | null = null;
  const notices = [...query.notices];
  if (!centre && query.near) {
    try {
      const [place] = await geocode(query.near, 'IN');
      if (place) {
        centre = place.point;
        placeNote =
          place.precision === 'city'
            ? `Searching around ${place.formattedAddress}. Distances are measured from the city centre, not your street.`
            : `Searching around ${place.formattedAddress}.`;
      } else {
        notices.push(`We could not find “${query.near}”. Try a city or area name.`);
      }
    } catch {
      notices.push('Place lookup is unavailable right now, so results are not limited by distance.');
    }
  } else if (centre) {
    placeNote = 'Searching around your location.';
  }

  let result: Awaited<ReturnType<typeof runSearch<HitSource>>> | null = null;
  let searchError: string | null = null;
  try {
    result = await runSearch<HitSource>(toSearchQuery(query, centre));
  } catch (error) {
    searchError = isAppError(error) && error.code === 'NOT_CONFIGURED'
      ? 'Search is not configured on this server.'
      : 'Search failed. Please try again.';
  }

  // The next genuinely free slot for each dentist result (a dentist hit is one
  // practice), from the same engine that books. Never estimated.
  // The slot type follows the search: someone filtering for video sees the
  // next free video time, not the next clinic visit.
  const slotType = query.values.appointmentType === 'VIDEO' || query.values.appointmentType === 'HOME_VISIT' ? query.values.appointmentType : 'CLINIC';
  const slotTypeLabel = slotType === 'VIDEO' ? 'video consultation' : slotType === 'HOME_VISIT' ? 'home visit' : 'clinic visit';
  const nextSlots = new Map<string, { localDate: string; localTime: string } | null>();
  const slotLabel = (s: { localDate: string; localTime: string }) =>
    `${new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s.localDate}T00:00:00Z`))}, ${s.localTime}`;

  // Sponsored slots: a separate query over running Prime campaigns — never
  // over, or into, the organic ranking — shown in their own labelled section.
  // Independent of the next free times, so both are fetched at once.
  const principal = await currentPrincipal();
  const [found, sponsored] = await Promise.all([
    result && query.type === 'dentist'
      ? Promise.all(result.hits.map(async (hit) => [hit.id, await nextAvailableSlot(hit.id, slotType).catch(() => null)] as const))
      : Promise.resolve([]),
    result
      ? sponsoredForSearch({
          type: query.type,
          point: centre,
          treatment: query.values.treatment || null,
          appointmentType: slotType,
          viewerUserId: isAuthenticated(principal) ? principal.userId : null,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);
  for (const [id, slot] of found) nextSlots.set(id, slot);

  const hasCriteria = Boolean(query.q || centre || query.filters.length > 0);
  // The shape of the search, never the words typed (they could say anything).
  if (result && hasCriteria) {
    void trackView('search_performed', 'search', query.type, isAuthenticated(principal) ? principal.userId : null, { withText: Boolean(query.q), withLocation: Boolean(centre), filters: query.filters.length, results: result.hits.length });
  }
  const nextHref = (() => {
    if (!result?.nextCursor) return null;
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const value = Array.isArray(v) ? v[0] : v;
      if (value && k !== 'cursor') next.set(k, value);
    }
    next.set('cursor', result.nextCursor);
    return `/find?${next.toString()}`;
  })();

  const [specialties, treatments, indexedCount] = await lookups;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <header className="tl-page__header">
        <h1>{query.type === 'clinic' ? 'Find a clinic' : 'Find a dentist'}</h1>
        <p className="tl-muted" style={{ margin: 0 }}>
          <a href="/which-dentist">Not sure which kind of dentist? Answer a few questions.</a>
        </p>
        <p className="tl-page__lead">
          Only dentists whose council registration Toothlogy has checked, and who a clinic has confirmed work there, are
          listed. Ranking uses relevance, distance and profile merit — never payment.
        </p>
      </header>

      <form method="get" action="/find" className="tl-form" role="search" aria-label="Search dentists and clinics">
        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Looking for</legend>
          <label className="tl-checkbox">
            <input type="radio" name="type" value="dentist" defaultChecked={query.type === 'dentist'} />
            <span>Dentists</span>
          </label>
          <label className="tl-checkbox">
            <input type="radio" name="type" value="clinic" defaultChecked={query.type === 'clinic'} />
            <span>Clinics</span>
          </label>
        </fieldset>

        <div className="tl-form-grid">
          <label className="tl-stack">
            <span>Treatment, name or problem</span>
            <input className="tl-input" type="search" name="q" defaultValue={query.q} placeholder="e.g. root canal, braces, toothache" />
          </label>
          <label className="tl-stack">
            <span>Near</span>
            <input className="tl-input" name="near" defaultValue={query.point ? '' : query.near} placeholder="City or area, e.g. Raipur" />
          </label>
          <label className="tl-stack">
            <span>Within</span>
            <select className="tl-input" name="radius" defaultValue={String(query.radiusKm)}>
              {FIND_RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
          <label className="tl-stack">
            <span>Sort by</span>
            <select className="tl-input" name="sort" defaultValue={query.sort}>
              <option value="relevance">Best match</option>
              <option value="distance">Nearest</option>
              {query.type === 'dentist' ? <option value="price_asc">Lowest fee</option> : null}
            </select>
          </label>
        </div>

        <details>
          <summary>More filters</summary>
          <div className="tl-form-grid" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
            <label className="tl-stack">
              <span>Treatment offered</span>
              <select className="tl-input" name="treatment" defaultValue={query.values.treatment}>
                <option value="">Any</option>
                {treatments.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {query.type === 'dentist' ? (
              <>
                <label className="tl-stack">
                  <span>Specialty</span>
                  <select className="tl-input" name="specialty" defaultValue={query.values.specialty}>
                    <option value="">Any</option>
                    {specialties.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tl-stack">
                  <span>Speaks</span>
                  <select className="tl-input" name="language" defaultValue={query.values.language}>
                    <option value="">Any language</option>
                    {LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tl-stack">
                  <span>Seen by</span>
                  <select className="tl-input" name="appointmentType" defaultValue={query.values.appointmentType}>
                    <option value="">Any</option>
                    <option value="VIDEO">Video consultation</option>
                    <option value="HOME_VISIT">Home visit</option>
                  </select>
                </label>
                <label className="tl-stack">
                  <span>Consultation fee up to (₹)</span>
                  <input className="tl-input" name="feeMax" inputMode="numeric" defaultValue={query.values.feeMax} />
                </label>
              </>
            ) : null}
            <label className="tl-checkbox">
              <input type="checkbox" name="emergency" value="1" defaultChecked={query.values.emergency} />
              <span>Sees dental emergencies</span>
            </label>
          </div>
        </details>

        <div className="tl-inline">
          {/* A plain submit button: this is a server component, and the
              design-system Button attaches a click handler. */}
          <button type="submit" className="tl-button tl-button--primary tl-button--md">
            <span>Search</span>
          </button>
          <Suspense fallback={null}>
            <UseMyLocation />
          </Suspense>
        </div>
      </form>

      {notices.map((n) => (
        <Alert key={n} tone="warning">
          {n}
        </Alert>
      ))}
      {placeNote ? <p className="tl-muted">{placeNote}</p> : null}

      {searchError ? (
        <ErrorState title="Search is unavailable" description={searchError} />
      ) : indexedCount === 0 ? (
        <EmptyState
          title={query.type === 'clinic' ? 'No verified clinics are listed yet' : 'No verified dentists are listed yet'}
          description="Toothlogy lists only professionals and clinics whose registration has been checked. Listings appear here as verification completes."
        />
      ) : result && result.hits.length === 0 ? (
        <EmptyState
          title="No matches"
          description={
            hasCriteria
              ? 'Nothing matches all of these. Try a wider distance, fewer filters or a different treatment name.'
              : 'Nothing to show.'
          }
        />
      ) : result ? (
        <>
        {sponsored.length > 0 ? (
          <section aria-label="Sponsored" className="tl-stack">
            <h2 style={{ fontSize: 'var(--tl-text-base)', margin: 0 }}>Sponsored</h2>
            <p className="tl-muted" style={{ margin: 0 }}>
              Paid Prime placements, shown separately. They do not change the order of the results below.
            </p>
            <ul className="tl-list">
              {sponsored.map((s) => (
                <li key={s.impressionId}>
                  <SponsoredCard slot={s} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-label="Results" className="tl-stack">
          <p className="tl-muted" role="status">
            {result.total} {result.total === 1 ? 'result' : 'results'}
          </p>
          <ul className="tl-list">
            {result.hits.map((hit) => {
              const f = hit.source.facets ?? {};
              const slug = str(f.slug);
              const href = slug ? (query.type === 'clinic' ? `/clinics/${slug}` : `/dentists/${slug}`) : null;
              const fee = typeof f.fee === 'number' ? f.fee : null;
              const currency = str(f.currency);
              const distance = km(hit.distanceMetres);
              return (
                <li key={`${hit.type}-${hit.id}`}>
                  <Card label={hit.source.title}>
                    <CardBody>
                      <div className="tl-card__title-row">
                        {href ? (
                          <Link href={href}>
                            <strong>{hit.source.title}</strong>
                          </Link>
                        ) : (
                          <strong>{hit.source.title}</strong>
                        )}
                        {hit.promoted ? <Badge tone="warning">Sponsored</Badge> : null}
                        {str(f.verified) === 'true' ? <Badge tone="success">Verified</Badge> : null}
                        {distance ? <span className="tl-muted">{distance}</span> : null}
                      </div>
                      {hit.source.summary ? <p style={{ margin: 0 }}>{hit.source.summary}</p> : null}
                      {query.type === 'dentist' ? (
                        <p className="tl-list__meta" style={{ margin: 0 }}>
                          {str(f.clinicSlug) ? (
                            <Link href={`/clinics/${str(f.clinicSlug)}`}>{str(f.clinicName)}</Link>
                          ) : (
                            str(f.clinicName)
                          )}
                          {str(f.locationName) ? ` · ${str(f.locationName)}` : ''}
                          {fee !== null && currency ? ` · Consultation ${formatMoney(money(BigInt(fee), currency), 'en-IN')}` : ''}
                          {typeof f.experienceYears === 'number' && f.experienceYears > 0 ? ` · ${f.experienceYears} years` : ''}
                        </p>
                      ) : (
                        <p className="tl-list__meta" style={{ margin: 0 }}>
                          {list(f.city).join(', ')}
                          {typeof f.branches === 'number' ? ` · ${f.branches} ${f.branches === 1 ? 'branch' : 'branches'}` : ''}
                          {typeof f.dentists === 'number' && f.dentists > 0 ? ` · ${f.dentists} verified dentists` : ''}
                        </p>
                      )}
                      {query.type === 'dentist' ? (
                        <p className="tl-list__meta" style={{ margin: 0 }}>
                          {list(f.appointmentTypes).map((t) => TYPE_LABELS[t] ?? t).join(', ')}
                          {list(f.language).length > 0
                            ? ` · Speaks ${list(f.language).map((c) => LANGUAGE_BY_CODE.get(c)?.name ?? c).join(', ')}`
                            : ''}
                          {str(f.emergency) === 'true' ? ' · Sees emergencies' : ''}
                          {str(f.bookingPaused) === 'true' ? ' · Not taking new bookings here' : ''}
                        </p>
                      ) : null}
                      {query.type === 'dentist' && slug && str(f.bookingPaused) !== 'true' ? (
                        nextSlots.get(hit.id) ? (
                          <p style={{ margin: 0 }} className="tl-inline">
                            <Link
                              className="tl-button tl-button--primary tl-button--sm"
                              href={`/book/${slug}?practice=${hit.id}&source=search${slotType !== 'CLINIC' ? `&type=${slotType}` : ''}`}
                            >
                              <span>Book</span>
                            </Link>
                            <span className="tl-muted">
                              Next free {slotTypeLabel}: {slotLabel(nextSlots.get(hit.id)!)}
                            </span>
                          </p>
                        ) : (
                          <p style={{ margin: 0 }} className="tl-muted">
                            No free {slotTypeLabel} times in the next few weeks.{' '}
                            <Link href={`/book/${slug}?practice=${hit.id}&source=search`}>Join the waitlist or ask for a call</Link>
                          </p>
                        )
                      ) : null}
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
          {nextHref ? (
            <p>
              <Link href={nextHref}>More results</Link>
            </p>
          ) : null}
          <p className="tl-muted">
            “Next free” is checked against each dentist’s real diary as this page loads; Book appears only where a time is
            actually free. The time is checked again when you book.
          </p>
        </section>
        </>
      ) : null}
    </div>
  );
}
