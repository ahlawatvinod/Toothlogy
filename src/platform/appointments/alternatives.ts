/**
 * Alternatives to rebooking the same dentist.
 *
 * Only dentists a patient can actually book are suggested: confirmed at the
 * same branch, discoverable, not paused, and with a genuinely free slot now —
 * found by the same engine that books. Search links carry the treatment and
 * the branch's location, so "a different dentist" or "a different clinic"
 * starts from where the patient already goes.
 */

import { db } from '../db/client';
import { nextAvailableSlot } from './availability';

export interface Alternatives {
  readonly clinicName: string;
  readonly clinicHref: string;
  readonly dentists: ReadonlyArray<{ practiceId: string; name: string; href: string; next: string }>;
  readonly findDentistHref: string;
  readonly findClinicHref: string;
}

function slotLabel(slot: { localDate: string; localTime: string }): string {
  const day = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${slot.localDate}T00:00:00Z`));
  return `${day}, ${slot.localTime}`;
}

export async function bookableAlternatives(appointment: {
  practiceId: string;
  locationId: string;
  serviceName: string;
  serviceOfferingId: string | null;
}): Promise<Alternatives> {
  const location = await db().location.findUniqueOrThrow({
    where: { id: appointment.locationId },
    select: { latitude: true, longitude: true, organization: { select: { name: true, slug: true } } },
  });
  // A location-wide service can be booked with another dentist at the branch;
  // one tied to the original dentist cannot, so it is not carried over.
  const offering = appointment.serviceOfferingId
    ? await db().serviceOffering.findUnique({ where: { id: appointment.serviceOfferingId }, select: { dentistProfileId: true, isActive: true } })
    : null;
  const carryService = offering && offering.isActive && offering.dentistProfileId === null ? `&service=${appointment.serviceOfferingId}` : '';

  const practices = await db().dentistPractice.findMany({
    where: {
      locationId: appointment.locationId,
      id: { not: appointment.practiceId },
      isConfirmed: true,
      bookingPaused: false,
      dentistProfile: { isDiscoverable: true, deletedAt: null },
    },
    select: { id: true, dentistProfile: { select: { slug: true, user: { select: { displayName: true } } } } },
    take: 10,
  });
  const found = await Promise.all(practices.map(async (p) => ({ p, slot: await nextAvailableSlot(p.id).catch(() => null) })));

  const near =
    location.latitude !== null && location.longitude !== null ? `&lat=${Number(location.latitude).toFixed(4)}&lng=${Number(location.longitude).toFixed(4)}&radius=10` : '';
  const q = encodeURIComponent(appointment.serviceName);
  return {
    clinicName: location.organization.name,
    clinicHref: `/clinics/${location.organization.slug}`,
    dentists: found
      .filter((x): x is { p: (typeof practices)[number]; slot: NonNullable<typeof x.slot> } => x.slot !== null)
      .slice(0, 3)
      .map(({ p, slot }) => ({
        practiceId: p.id,
        name: p.dentistProfile.user.displayName ?? 'Dentist',
        href: `/book/${p.dentistProfile.slug}?practice=${p.id}${carryService}&source=search`,
        next: slotLabel(slot),
      })),
    findDentistHref: `/find?type=dentist&q=${q}${near}`,
    findClinicHref: `/find?type=clinic&q=${q}${near}`,
  };
}
