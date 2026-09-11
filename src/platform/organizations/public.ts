/**
 * TOOTHLOGY PUBLIC CLINIC VIEW
 *
 * What an anonymous visitor may see about a clinic. Everything here is chosen,
 * not filtered after the fact:
 *
 * - Suspended and closed organizations do not resolve.
 * - Permanently closed branches are omitted; temporarily closed ones are shown
 *   as closed, because a patient who knows the clinic should learn why.
 * - Dentists appear only when the clinic has confirmed them AND they are
 *   discoverable (verified, licensed, locatable) — the same rule as search, so
 *   the clinic page can never list someone search would hide.
 * - Member lists, invitations, verification evidence and internal notes are
 *   never selected.
 *
 * `isVerified` is computed here, including expiry, so no page has to remember
 * that a verification from three years ago is not a verification today.
 */

import { db } from '../db/client';
import { listPublicOfferings } from './offerings';
import { listClosures, localDate } from './location-management';

export async function getPublicClinic(slug: string) {
  const organization = await db().organization.findFirst({
    where: { slug, deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      description: true,
      website: true,
      phone: true,
      logoFileId: true,
      currency: true,
      ownerUserId: true,
      verifiedAt: true,
      verificationExpires: true,
      locations: {
        where: { deletedAt: null, status: { not: 'PERMANENTLY_CLOSED' } },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          status: true,
          timezone: true,
          phone: true,
          latitude: true,
          longitude: true,
          description: true,
          facilities: true,
          chairs: true,
          wheelchairAccessible: true,
          parkingAvailable: true,
          emergencyAvailable: true,
          homeVisitRadiusKm: true,
          photoFileIds: true,
          address: { select: { lines: true, locality: true, regionName: true, postalCode: true, countryCode: true } },
          businessHours: {
            orderBy: [{ dayOfWeek: 'asc' }, { opensAtMinutes: 'asc' }],
            select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
          },
          dentistPractices: {
            where: { isConfirmed: true, dentistProfile: { isDiscoverable: true, deletedAt: null } },
            select: {
              id: true,
              bookingPaused: true,
              dentistProfile: { select: { slug: true, headline: true, user: { select: { displayName: true } } } },
            },
          },
        },
      },
    },
  });

  if (!organization || organization.locations.length === 0) return null;

  const now = new Date();
  const isVerified =
    organization.verifiedAt !== null && (organization.verificationExpires === null || organization.verificationExpires > now);

  const locations = await Promise.all(
    organization.locations.map(async (l) => {
      const [offerings, closures] = await Promise.all([listPublicOfferings(l.id), listClosures(l.id, localDate(l.timezone, now))]);
      return {
        ...l,
        // Decimal in the database; plain numbers for pages, maps and JSON-LD.
        latitude: l.latitude === null ? null : Number(l.latitude),
        longitude: l.longitude === null ? null : Number(l.longitude),
        dentists: l.dentistPractices.map((p) => ({
          practiceId: p.id,
          bookingPaused: p.bookingPaused,
          slug: p.dentistProfile.slug,
          name: p.dentistProfile.user.displayName ?? 'Dentist',
          headline: p.dentistProfile.headline,
        })),
        // A dentist-specific price is shown only for a dentist this page also
        // lists; otherwise it would name someone search does not show.
        offerings: offerings
          .filter((o) => !o.dentistProfile || o.dentistProfile.isDiscoverable)
          .map((o) => ({
            id: o.id,
            name: o.name,
            category: o.treatment?.category ?? null,
            treatmentKey: o.treatment?.key ?? null,
            description: o.description ?? o.treatment?.description ?? null,
            priceMinor: o.priceMinor,
            priceMaxMinor: o.priceMaxMinor,
            currency: o.currency,
            durationMinutes: o.durationMinutes,
            appointmentTypes: o.appointmentTypes,
            requiresConsultation: o.requiresConsultation,
            dentistName: o.dentistProfile?.user.displayName ?? null,
          })),
        closures,
        today: localDate(l.timezone, now),
      };
    }),
  );

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    type: organization.type,
    description: organization.description,
    website: organization.website,
    phone: organization.phone,
    logoFileId: organization.logoFileId,
    currency: organization.currency,
    isVerified,
    isClaimed: organization.ownerUserId !== null,
    locations,
  };
}

export type PublicClinic = NonNullable<Awaited<ReturnType<typeof getPublicClinic>>>;
