/**
 * TL-PAGE-DENTISTPUBLIC-001 — /dentists/:slug
 *
 * The public professional profile — the page the DISCOVER pillar exists to send
 * patients to.
 *
 * Two rules it enforces:
 *
 * 1. **Only discoverable dentists resolve.** `getPublicDentistProfile` returns
 *    null for anything unverified, so a profile reachable by URL but excluded
 *    from search cannot exist. Otherwise an unverified dentist could share a
 *    direct link and present as listed on Toothlogy.
 * 2. **Only verified qualifications are shown.** Displaying a claimed credential
 *    beside a verified badge implies it was checked.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicDentistProfile } from '@/platform/dentists/service';
import { nextAvailableSlot } from '@/platform/appointments/availability';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { recordSponsoredFollowUp, sponsoredForProfile } from '@/platform/sponsored/serve';
import { SponsoredCard } from '@/components/sponsored/sponsored-card';
import { formatMoney, money } from '@/platform/money';
import { LANGUAGE_BY_CODE } from '@/registry/globalization';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { listPublicReviews, MIN_FOR_AVERAGE, ratingSummary } from '@/platform/reviews/service';
import { Stars } from '@/components/reviews/stars';
import { trackView } from '@/platform/analytics/events';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) {
    return { title: 'Dentist not found', robots: { index: false, follow: false } };
  }

  const name = profile.user.displayName ?? 'Dentist';

  return {
    title: `${name} — verified dentist on Toothlogy`,
    description:
      profile.headline ??
      `${name} is a verified dentist on Toothlogy. View qualifications, specialties and languages.`,
    // Indexable: this is exactly the content the DISCOVER pillar wants found,
    // and it only exists for verified dentists.
    robots: { index: true, follow: true },
    alternates: { canonical: `/dentists/${slug}` },
    openGraph: {
      title: `${name} — verified dentist`,
      description: profile.headline ?? undefined,
      type: 'profile',
    },
  };
}

export default async function PublicDentistPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) notFound();

  const principal = await currentPrincipal();
  const viewerUserId = isAuthenticated(principal) ? principal.userId : null;
  // Counted for the practice's dashboard; the viewer is identified only with
  // their analytics consent.
  void trackView('profile_viewed', 'dentist', profile.id, viewerUserId);
  // A visit from a Sponsored result: count the profile view once and keep the
  // click on the Book links, for attribution.
  const spParam = (await searchParams).sp;
  const sp = typeof spParam === 'string' && /^[a-z]{3}_[0-9A-Z]{10,40}$/.test(spParam) ? spParam : null;
  if (sp) await recordSponsoredFollowUp(sp, 'PROFILE_VIEW', viewerUserId);
  const spSuffix = sp ? `&sp=${sp}` : '';
  // Sponsored slot for other practices near this dentist's first branch —
  // never this dentist at any of their branches.
  const firstBranch = profile.practices[0]
    ? await db().dentistPractice.findUnique({ where: { id: profile.practices[0].id }, select: { location: { select: { latitude: true, longitude: true } } } })
    : null;
  const sponsored = await sponsoredForProfile({
    point:
      firstBranch?.location.latitude != null && firstBranch.location.longitude != null
        ? { latitude: Number(firstBranch.location.latitude), longitude: Number(firstBranch.location.longitude) }
        : null,
    excludePracticeIds: profile.practices.map((p) => p.id),
    viewerUserId,
  }).catch(() => []);

  const name = profile.user.displayName ?? 'Dentist';
  // Reviews follow visits that took place; the average only from three.
  const [rating, reviews] = await Promise.all([ratingSummary({ dentistProfileId: profile.id }), listPublicReviews({ dentistProfileId: profile.id })]);
  // The real next free time at each practice, from the booking engine.
  const nextSlots = new Map(await Promise.all(profile.practices.map(async (p) => [p.id, await nextAvailableSlot(p.id).catch(() => null)] as const)));
  const slotLabel = (s: { localDate: string; localTime: string }) =>
    `${new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s.localDate}T00:00:00Z`))}, ${s.localTime}`;
  const yearsPractising = profile.practisingSince
    ? new Date().getFullYear() - profile.practisingSince
    : null;

  /*
   * Structured data so search engines can render a rich result. Emitted only
   * for verified dentists — publishing Physician markup for an unverified
   * profile would be a false credential claim to every search engine that reads
   * it, which is a considerably worse version of showing it on our own site.
   */
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name,
    description: profile.bio ?? profile.headline ?? undefined,
    knowsLanguage: profile.languages.map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code),
    medicalSpecialty: profile.specialties.map((s) => s.specialty.name),
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{name}</h1>
          <Badge tone="success">Verified</Badge>
        </div>
        {profile.headline ? <p className="tl-page__lead">{profile.headline}</p> : null}
        <p className="tl-muted">
          {yearsPractising !== null ? `${yearsPractising} years practising · ` : ''}
          {profile.languages
            .map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code)
            .join(', ')}
        </p>
      </header>

      {profile.bio ? (
        <div className="tl-prose">
          <p>{profile.bio}</p>
        </div>
      ) : null}

      {profile.specialties.length > 0 ? (
        <Card label="Specialties">
          <CardHeader>
            <strong>Specialties</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {profile.specialties.map((s) => (
                <li key={s.specialty.key}>
                  <strong>{s.specialty.name}</strong>
                  <span className="tl-list__meta">{s.specialty.description}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Verified qualifications">
        <CardHeader>
          <strong>Verified qualifications</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            Each of these has been checked against the issuing council&rsquo;s register.
          </p>
          <ul className="tl-list">
            {profile.qualifications.map((q) => (
              <li key={q.id}>
                <div className="tl-card__title-row">
                  <strong>
                    {q.degree} — {q.institution}
                  </strong>
                  <Badge tone="success">Verified</Badge>
                </div>
                <span className="tl-list__meta">
                  {q.year}
                  {q.registrationBody ? ` · ${q.registrationBody}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {profile.consultationFeeMinor !== null && profile.consultationCurrency ? (
        <Card label="Consultation fee">
          <CardHeader>
            <strong>Consultation fee</strong>
          </CardHeader>
          <CardBody>
            <p style={{ fontSize: 'var(--tl-text-xl)', margin: 0 }}>
              {formatMoney(
                money(BigInt(profile.consultationFeeMinor), profile.consultationCurrency),
                'en-IN',
              )}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {profile.practices.length > 0 ? (
        <Card label={`Where ${name} practises`}>
          <CardHeader>
            <strong>Where {name} practises</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {profile.practices.map((p) => (
                <li key={p.id}>
                  <Link href={`/clinics/${p.location.organization.slug}`}>
                    <strong>{p.location.organization.name}</strong>
                  </Link>
                  <span className="tl-list__meta">
                    {p.location.name}
                    {p.location.address?.locality ? ` · ${p.location.address.locality}` : ''} — confirmed by the clinic
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Patient reviews">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>Patient reviews</strong>
            {rating.average !== null ? (
              <span>
                <Stars rating={rating.average} label={`${rating.average} out of 5 stars from ${rating.count} reviews`} /> {rating.average} from {rating.count} reviews
              </span>
            ) : rating.count > 0 ? (
              <span className="tl-muted">
                {rating.count} review{rating.count === 1 ? '' : 's'} — an average is shown from {MIN_FOR_AVERAGE}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {reviews.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              No reviews yet. Only patients whose visit took place can review.
            </p>
          ) : (
            <ul className="tl-list" aria-label="Patient reviews">
              {reviews.map((r) => (
                <li key={r.id} className="tl-stack">
                  <div className="tl-card__title-row">
                    <Stars rating={r.rating} />
                    <strong>{r.reviewer}</strong>
                    <span className="tl-list__meta">
                      {r.service} · visited {new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(r.visitMonth)}
                      {r.edited ? ' · edited' : ''}
                    </span>
                  </div>
                  {r.body ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p> : null}
                  {r.response ? <p className="tl-muted" style={{ margin: 0 }}>Reply from the practice: “{r.response.body}”</p> : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card label="Booking">
        <CardHeader>
          <strong>Book an appointment</strong>
        </CardHeader>
        <CardBody>
          {profile.practices.length > 0 ? (
            <ul className="tl-list">
              {profile.practices.map((p) => {
                const slot = nextSlots.get(p.id);
                return (
                  <li key={p.id} className="tl-stack">
                    <strong>
                      {p.location.organization.name}, {p.location.name}
                    </strong>
                    {slot ? (
                      <span className="tl-inline">
                        <Link className="tl-button tl-button--primary tl-button--sm" href={`/book/${profile.slug}?practice=${p.id}&source=profile${spSuffix}`}>
                          <span>Book</span>
                        </Link>
                        <span className="tl-muted">Next free clinic visit: {slotLabel(slot)}</span>
                      </span>
                    ) : (
                      <span className="tl-muted">
                        No free times in the next few weeks. <Link href={`/book/${profile.slug}?practice=${p.id}&source=profile${spSuffix}`}>Join the waitlist or ask for a call</Link>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="tl-muted" style={{ margin: 0 }}>
              This dentist has no branch taking bookings on Toothlogy right now.
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
    </div>
  );
}
