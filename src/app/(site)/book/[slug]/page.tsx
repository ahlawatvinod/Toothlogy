/**
 * TL-PAGE-BOOK-001 — /book/:slug
 *
 * Book an appointment with a verified dentist: branch → service → type →
 * date → time → who → confirm. Everything offered comes from the database:
 * only confirmed practices at active branches, only active services at that
 * branch, only slots the availability engine generates. The booking's result
 * is the server's own answer — confirmed, or requested and awaiting the
 * clinic — never an optimistic "done".
 *
 * Not indexable: it is an action page, and the dentist's profile is the page
 * search engines should find.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { formatMoney, money } from '@/platform/money';
import { listDependents } from '@/platform/appointments/dependents';
import { recordSponsoredFollowUp } from '@/platform/sponsored/serve';
import { BookingFlow, type BookablePractice } from './booking-flow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Book an appointment',
  robots: { index: false, follow: false },
};

function priceLabel(minor: number | null, maxMinor: number | null, currency: string | null): string {
  if (minor === null || !currency) return 'Price on consultation';
  const from = formatMoney(money(BigInt(minor), currency), 'en-IN');
  return maxMinor !== null && maxMinor > minor ? `${from} – ${formatMoney(money(BigInt(maxMinor), currency), 'en-IN')}` : from;
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const one = (k: string) => (typeof query[k] === 'string' ? (query[k] as string) : undefined);

  const profile = await db().dentistProfile.findFirst({
    where: { slug, isDiscoverable: true, deletedAt: null },
    select: {
      id: true,
      slug: true,
      headline: true,
      consultationFeeMinor: true,
      consultationCurrency: true,
      user: { select: { displayName: true } },
      practices: {
        where: { isConfirmed: true, location: { deletedAt: null, status: 'ACTIVE' } },
        include: {
          location: {
            select: {
              id: true,
              name: true,
              timezone: true,
              homeVisitRadiusKm: true,
              address: { select: { locality: true } },
              organization: { select: { name: true, slug: true, currency: true, status: true, deletedAt: true } },
            },
          },
        },
      },
    },
  });
  if (!profile) notFound();

  const practices = profile.practices.filter(
    (p) => p.location.organization.deletedAt === null && ['ACTIVE', 'PENDING'].includes(p.location.organization.status),
  );
  const offerings = await db().serviceOffering.findMany({
    where: {
      locationId: { in: practices.map((p) => p.locationId) },
      isActive: true,
      OR: [{ dentistProfileId: null }, { dentistProfileId: profile.id }],
    },
    orderBy: { name: 'asc' },
  });

  const principal = await currentPrincipal();
  // Arrived from a sponsored click: count the booking click once, and carry the
  // click to the booking for attribution (never for price).
  const sponsoredClickId = one('sp') ?? null;
  if (sponsoredClickId) await recordSponsoredFollowUp(sponsoredClickId, 'BOOK_CLICK', isAuthenticated(principal) ? principal.userId : null);
  const signedIn = isAuthenticated(principal);
  const dependents = signedIn ? await listDependents(principal) : [];

  // "Book again": prefill from one of the patient's own past appointments.
  const requestedType = one('type');
  let initial = {
    practiceId: one('practice') ?? null,
    serviceOfferingId: one('service') ?? null,
    rebookId: null as string | null,
    // Carried from a search filtered by appointment type; the flow ignores it
    // where the practice does not offer that type.
    type: (requestedType === 'VIDEO' || requestedType === 'HOME_VISIT' ? requestedType : null) as 'VIDEO' | 'HOME_VISIT' | 'CLINIC' | null,
  };
  const rebook = one('rebook');
  if (rebook && signedIn) {
    const past = await db().appointment.findFirst({
      where: { id: rebook, patientUserId: principal.userId, dentistProfileId: profile.id },
      select: { id: true, practiceId: true, serviceOfferingId: true, type: true },
    });
    if (past) initial = { practiceId: past.practiceId, serviceOfferingId: past.serviceOfferingId, rebookId: past.id, type: past.type };
  }

  const bookable: BookablePractice[] = practices.map((p) => {
    const feeMinor = p.consultationFeeMinor ?? profile.consultationFeeMinor;
    const feeCurrency = p.consultationFeeMinor !== null ? p.location.organization.currency : profile.consultationCurrency;
    return {
      id: p.id,
      locationName: p.location.name,
      organizationName: p.location.organization.name,
      organizationSlug: p.location.organization.slug,
      locality: p.location.address?.locality ?? null,
      timezone: p.location.timezone,
      autoConfirm: p.autoConfirm,
      bookingPaused: p.bookingPaused,
      accepts: { video: p.acceptsVideo, homeVisit: p.acceptsHomeVisit && p.location.homeVisitRadiusKm !== null, emergency: p.acceptsEmergency },
      homeVisitRadiusKm: p.location.homeVisitRadiusKm,
      consultationLabel: priceLabel(feeMinor, null, feeCurrency),
      services: offerings
        .filter((o) => o.locationId === p.locationId)
        .map((o) => ({
          id: o.id,
          name: o.name,
          priceLabel: priceLabel(o.priceMinor, o.priceMaxMinor, o.currency),
          durationMinutes: o.durationMinutes,
          appointmentTypes: o.appointmentTypes,
          requiresConsultation: o.requiresConsultation,
          dentistSpecific: o.dentistProfileId !== null,
        })),
    };
  });

  const name = profile.user.displayName ?? 'Dentist';
  const returnTo = `/book/${profile.slug}${query.practice ? `?practice=${encodeURIComponent(String(query.practice))}` : ''}`;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '44rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/find">Find</Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/dentists/${profile.slug}`}>{name}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Book</span>
      </nav>
      <header className="tl-page__header">
        <h1>Book with {name}</h1>
        {profile.headline ? <p className="tl-page__lead">{profile.headline}</p> : null}
      </header>

      {bookable.length === 0 ? (
        <p className="tl-muted">This dentist has no branch taking bookings on Toothlogy right now.</p>
      ) : (
        <BookingFlow
          dentist={{ id: profile.id, name, slug: profile.slug }}
          practices={bookable}
          signedIn={signedIn}
          dependents={dependents}
          initial={initial}
          source={one('source') === 'search' ? 'SEARCH' : one('source') === 'clinic_page' ? 'CLINIC_PAGE' : initial.rebookId ? 'REBOOK' : 'PROFILE'}
          loginHref={`/login?next=${encodeURIComponent(returnTo)}`}
          sponsoredClickId={sponsoredClickId}
        />
      )}
    </div>
  );
}
