/**
 * TOOTHLOGY DISCOVERY INDEXER
 *
 * Turns the database into search documents. What it publishes is exactly what
 * the discovery rules allow, and nothing else:
 *
 * - **Dentists** — one document per confirmed practice at an active branch
 *   with a map position, and only while the dentist is discoverable (verified,
 *   unexpired). One per practice rather than one per dentist, so a dentist who
 *   works at two branches is found near either. Every other practice's
 *   document is withdrawn on each pass.
 * - **Clinics** — only while their verification is current. An unverified
 *   clinic still has a public page (marked "Not verified", not indexable by
 *   search engines); it is not offered in Toothlogy's own results, the same
 *   conservative rule the sitemap follows.
 *
 * RANKING INPUT IS MERIT ONLY (Constitution P3)
 * `qualityScore` is 0–1 from verified qualifications, experience and profile
 * completeness. Nothing here reads a payment, a plan or a campaign — paid
 * placement is a separate, labelled slot added by the discovery layer.
 *
 * Facets carry filterable values (allow-listed per type in search/service.ts)
 * plus display fields such as `slug`; display fields are not in the allow-list,
 * so the public API cannot filter on them.
 */

import { db } from '../db/client';
import { logger } from '../observability/logger';
import { indexDocuments, removeFromIndex } from '../search/service';
import type { IndexDocument } from '../search/ports';
import { getPublicClinic } from '../organizations/public';
import { FACILITY_BY_KEY } from '../catalogue/facilities';

const EXPERIENCE_CAP_YEARS = 30;
const PAGE = 200;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Drop undefined entries so the stored JSON has no holes. */
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v !== null));
}

export interface DentistMerit {
  readonly verifiedQualifications: number;
  readonly practisingSince: number | null;
  readonly bio: string | null;
  readonly headline: string | null;
  readonly hasFee: boolean;
  readonly languages: number;
}

/**
 * 0–1. 40% verified qualifications (three or more is full marks), 30%
 * experience (thirty years is full marks), 30% profile completeness.
 */
export function dentistQualityScore(m: DentistMerit, now: Date = new Date()): number {
  const verified = Math.min(m.verifiedQualifications, 3) / 3;
  const years =
    m.practisingSince !== null
      ? Math.max(0, Math.min(now.getUTCFullYear() - m.practisingSince, EXPERIENCE_CAP_YEARS)) / EXPERIENCE_CAP_YEARS
      : 0;
  const completeness =
    (m.bio && m.bio.trim().length >= 40 ? 0.4 : 0) + (m.headline ? 0.2 : 0) + (m.hasFee ? 0.2 : 0) + (m.languages >= 2 ? 0.2 : 0);
  return round3(0.4 * verified + 0.3 * years + 0.3 * completeness);
}

// ---------------------------------------------------------------------------
// Dentists
// ---------------------------------------------------------------------------

export async function buildDentistDocuments(
  dentistProfileId: string,
  now: Date = new Date(),
): Promise<{ publish: IndexDocument[]; withdraw: string[]; qualityScore: number | null }> {
  const profile = await db().dentistProfile.findUnique({
    where: { id: dentistProfileId },
    include: {
      user: { select: { displayName: true } },
      qualifications: { where: { isVerified: true }, select: { degree: true } },
      specialties: { include: { specialty: { select: { key: true, name: true } } } },
      practices: {
        include: {
          location: {
            include: {
              address: true,
              organization: { select: { name: true, slug: true, status: true, deletedAt: true, currency: true } },
            },
          },
        },
      },
    },
  });
  if (!profile) return { publish: [], withdraw: [], qualityScore: null };

  const practiceIds = profile.practices.map((p) => p.id);
  const eligible = profile.isDiscoverable && profile.deletedAt === null;
  const practices = eligible
    ? profile.practices.filter(
        (p) =>
          p.isConfirmed &&
          p.location.deletedAt === null &&
          p.location.status === 'ACTIVE' &&
          p.location.latitude !== null &&
          p.location.longitude !== null &&
          p.location.organization.deletedAt === null &&
          (p.location.organization.status === 'ACTIVE' || p.location.organization.status === 'PENDING'),
      )
    : [];

  const qualityScore = dentistQualityScore(
    {
      verifiedQualifications: profile.qualifications.length,
      practisingSince: profile.practisingSince,
      bio: profile.bio,
      headline: profile.headline,
      hasFee: profile.consultationFeeMinor !== null,
      languages: profile.languages.length,
    },
    now,
  );

  if (practices.length === 0) return { publish: [], withdraw: practiceIds, qualityScore };

  // The clinic's own prices plus this dentist's personal ones, at these branches.
  const offerings = await db().serviceOffering.findMany({
    where: {
      isActive: true,
      locationId: { in: practices.map((p) => p.locationId) },
      OR: [{ dentistProfileId: null }, { dentistProfileId: profile.id }],
    },
    select: { locationId: true, treatment: { select: { key: true, name: true } } },
  });

  const name = profile.user.displayName ?? 'Dentist';
  const specialtyKeys = profile.specialties.map((s) => s.specialty.key);
  const specialtyNames = profile.specialties.map((s) => s.specialty.name);
  const experienceYears = profile.practisingSince !== null ? Math.max(0, now.getUTCFullYear() - profile.practisingSince) : undefined;

  const publish: IndexDocument[] = practices.map((p) => {
    const location = p.location;
    const treatments = offerings.filter((o) => o.locationId === location.id && o.treatment).map((o) => o.treatment!);
    const fee = p.consultationFeeMinor ?? profile.consultationFeeMinor ?? undefined;
    const appointmentTypes = [
      'CLINIC',
      ...(p.acceptsVideo ? ['VIDEO'] : []),
      ...(p.acceptsHomeVisit && location.homeVisitRadiusKm !== null ? ['HOME_VISIT'] : []),
    ];
    const locality = location.address?.locality ?? null;

    return {
      id: p.id,
      type: 'dentist',
      location: { latitude: Number(location.latitude), longitude: Number(location.longitude) },
      qualityScore,
      fields: {
        title: name,
        summary: profile.headline ?? ([specialtyNames[0], locality].filter(Boolean).join(' · ') || null),
        body: [
          name,
          profile.headline,
          profile.bio,
          ...specialtyNames,
          ...profile.qualifications.map((q) => q.degree),
          ...treatments.map((t) => t.name),
          location.organization.name,
          location.name,
          locality,
          location.address?.regionName,
        ]
          .filter(Boolean)
          .join(' '),
        facets: compact({
          specialty: specialtyKeys,
          language: profile.languages,
          gender: profile.gender ?? undefined,
          verified: 'true',
          fee,
          price: fee,
          experienceYears,
          appointmentTypes,
          emergency: p.acceptsEmergency ? 'true' : 'false',
          city: locality ? [locality] : [],
          treatment: [...new Set(treatments.map((t) => t.key))],
          // Display only — not in the filter allow-list.
          slug: profile.slug,
          // A practice fee is in the clinic's currency; the profile fee in its own.
          currency:
            fee === undefined
              ? undefined
              : p.consultationFeeMinor !== null
                ? location.organization.currency
                : (profile.consultationCurrency ?? undefined),
          clinicName: location.organization.name,
          clinicSlug: location.organization.slug,
          locationName: location.name,
          bookingPaused: p.bookingPaused ? 'true' : 'false',
        }),
        locale: 'en',
        countryCode: location.address?.countryCode ?? null,
        isPublished: true,
      },
    };
  });

  const published = new Set(publish.map((d) => d.id));
  return { publish, withdraw: practiceIds.filter((id) => !published.has(id)), qualityScore };
}

export async function reindexDentist(dentistProfileId: string): Promise<{ published: number; withdrawn: number }> {
  const { publish, withdraw, qualityScore } = await buildDentistDocuments(dentistProfileId);
  if (withdraw.length > 0) await removeFromIndex('dentist', withdraw);
  if (publish.length > 0) await indexDocuments(publish);
  if (qualityScore !== null) {
    // Stored on the profile too, so the score a dentist is ranked by is
    // inspectable rather than living only inside the index.
    await db().dentistProfile.updateMany({
      where: { id: dentistProfileId, NOT: { qualityScore } },
      data: { qualityScore },
    });
  }
  return { published: publish.length, withdrawn: withdraw.length };
}

// ---------------------------------------------------------------------------
// Clinics
// ---------------------------------------------------------------------------

export function clinicQualityScore(c: {
  isVerified: boolean;
  hasHours: boolean;
  hasServices: boolean;
  hasDescription: boolean;
  hasFacilities: boolean;
}): number {
  return round3(
    (c.isVerified ? 0.4 : 0) + (c.hasHours ? 0.2 : 0) + (c.hasServices ? 0.2 : 0) + (c.hasDescription ? 0.1 : 0) + (c.hasFacilities ? 0.1 : 0),
  );
}

export async function buildClinicDocument(organizationId: string): Promise<IndexDocument | null> {
  const organization = await db().organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
  if (!organization) return null;
  const clinic = await getPublicClinic(organization.slug);
  if (!clinic || !clinic.isVerified) return null;

  const open = clinic.locations.filter((l) => l.status === 'ACTIVE');
  const positioned = open.find((l) => l.latitude !== null && l.longitude !== null);
  const localities = [...new Set(clinic.locations.map((l) => l.address?.locality).filter((v): v is string => Boolean(v)))];
  const facilities = [...new Set(clinic.locations.flatMap((l) => l.facilities))];
  const treatmentKeys = [...new Set(clinic.locations.flatMap((l) => l.offerings.map((o) => o.treatmentKey)).filter((k): k is string => Boolean(k)))];
  const treatmentNames = [...new Set(clinic.locations.flatMap((l) => l.offerings.map((o) => o.name)))];
  const dentists = [...new Map(clinic.locations.flatMap((l) => l.dentists).map((d) => [d.slug, d])).values()];

  return {
    id: clinic.id,
    type: 'clinic',
    location: positioned ? { latitude: positioned.latitude!, longitude: positioned.longitude! } : undefined,
    qualityScore: clinicQualityScore({
      isVerified: clinic.isVerified,
      hasHours: clinic.locations.some((l) => l.businessHours.length > 0),
      hasServices: treatmentNames.length > 0,
      hasDescription: Boolean(clinic.description),
      hasFacilities: facilities.length > 0,
    }),
    fields: {
      title: clinic.name,
      // The clinic's own words only. City and branch count are facets, and the
      // result card shows them from there; generating a summary from them here
      // printed the same facts twice.
      summary: clinic.description ?? null,
      body: [
        clinic.name,
        clinic.description,
        ...clinic.locations.map((l) => l.name),
        ...localities,
        ...treatmentNames,
        ...facilities.map((f) => FACILITY_BY_KEY.get(f)?.label ?? f),
        ...dentists.map((d) => d.name),
      ]
        .filter(Boolean)
        .join(' '),
      facets: compact({
        city: localities,
        facility: facilities,
        emergency: clinic.locations.some((l) => l.emergencyAvailable) ? 'true' : 'false',
        verified: 'true',
        treatment: treatmentKeys,
        // Display only.
        slug: clinic.slug,
        branches: clinic.locations.length,
        dentists: dentists.length,
      }),
      locale: 'en',
      countryCode: clinic.locations[0]?.address?.countryCode ?? null,
      isPublished: true,
    },
  };
}

export async function reindexClinic(organizationId: string): Promise<boolean> {
  const document = await buildClinicDocument(organizationId);
  if (!document) {
    await removeFromIndex('clinic', [organizationId]);
    return false;
  }
  await indexDocuments([document]);
  return true;
}

/** The clinic and everyone practising at any of its branches. */
export async function reindexOrganization(organizationId: string): Promise<void> {
  await reindexClinic(organizationId);
  const practices = await db().dentistPractice.findMany({
    where: { location: { organizationId } },
    select: { dentistProfileId: true },
    distinct: ['dentistProfileId'],
  });
  for (const p of practices) await reindexDentist(p.dentistProfileId);
}

// ---------------------------------------------------------------------------
// Safe wrappers and the full rebuild
// ---------------------------------------------------------------------------

/**
 * For hooks inside business operations: a search failure must not undo a
 * verification or a price change that already committed. It is logged, and
 * the `search.reindex` job repairs it.
 */
export async function reindexDentistSafely(dentistProfileId: string): Promise<void> {
  try {
    await reindexDentist(dentistProfileId);
  } catch (error) {
    logger.error('Search reindex failed for a dentist; search.reindex will repair it', { dentistProfileId, error });
  }
}

export async function reindexOrganizationSafely(organizationId: string): Promise<void> {
  try {
    await reindexOrganization(organizationId);
  } catch (error) {
    logger.error('Search reindex failed for an organization; search.reindex will repair it', { organizationId, error });
  }
}

/** Rebuild every dentist and clinic document. Idempotent; paged by id. */
export async function reindexAll(): Promise<{ dentistsPublished: number; dentistDocumentsWithdrawn: number; clinicsPublished: number }> {
  let dentistsPublished = 0;
  let dentistDocumentsWithdrawn = 0;
  let clinicsPublished = 0;

  for (let cursor: string | undefined; ; ) {
    const page = await db().dentistProfile.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const { id } of page) {
      const result = await reindexDentist(id);
      dentistsPublished += result.published;
      dentistDocumentsWithdrawn += result.withdrawn;
    }
    if (page.length < PAGE) break;
    cursor = page[page.length - 1]!.id;
  }

  for (let cursor: string | undefined; ; ) {
    const page = await db().organization.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    for (const { id } of page) if (await reindexClinic(id)) clinicsPublished += 1;
    if (page.length < PAGE) break;
    cursor = page[page.length - 1]!.id;
  }

  return { dentistsPublished, dentistDocumentsWithdrawn, clinicsPublished };
}
