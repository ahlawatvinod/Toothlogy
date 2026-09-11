/**
 * TOOTHLOGY DENTIST PROFILE SERVICE
 *
 * Professional profiles and the lifecycle that governs whether one is
 * discoverable.
 *
 *     DRAFT ──submit──> SUBMITTED ──approve──> VERIFIED ──revoke──> SUSPENDED
 *                            │
 *                            └──reject──────> REJECTED ──resubmit──> SUBMITTED
 *
 * THE RULE THAT MATTERS: A DENTIST IS NOT DISCOVERABLE UNTIL VERIFIED
 *
 * `isDiscoverable` is computed by this service and never set by the dentist.
 * It requires an unexpired verification AND at least one confirmed practice
 * location with coordinates. Both halves are necessary: an unverified dentist
 * in search betrays the TRUST pillar, and a verified dentist with no locatable
 * clinic cannot be reached, so surfacing them wastes a patient's time.
 *
 * Constitution P2 and P3 are enforced here rather than in the discovery query,
 * because a filter can be forgotten at one call site; a stored flag maintained
 * by one service cannot.
 */

import { z } from 'zod';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, isUniqueConstraintError, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { LANGUAGE_BY_CODE } from '@/registry/globalization';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const qualificationSchema = z.object({
  degree: z.string().trim().min(2, 'Enter the qualification.').max(80),
  institution: z.string().trim().min(2, 'Enter the institution.').max(200),
  year: z
    .number()
    .int()
    .min(1900, 'Enter a valid year.')
    // Guards against a typo putting a qualification in the future, which would
    // then be "verified" against a certificate that cannot exist.
    .max(new Date().getFullYear(), 'The year cannot be in the future.'),
  registrationNumber: z.string().trim().max(60).optional(),
  registrationBody: z.string().trim().max(160).optional(),
});

export type QualificationInput = z.infer<typeof qualificationSchema>;

export const dentistProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Use at least 3 characters.')
    .max(80)
    .regex(slugPattern, 'Use lowercase letters, numbers and single hyphens only.'),
  headline: z.string().trim().max(160).optional(),
  bio: z.string().trim().max(4000).optional(),
  practisingSince: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .optional(),
  languages: z
    .array(z.string().min(2).max(10))
    .max(12)
    .default([])
    .refine(
      (codes) => codes.every((code) => LANGUAGE_BY_CODE.has(code)),
      'One or more languages are not supported.',
    ),
  gender: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']).optional(),
  /** Minor units. Never a float (Constitution §4). */
  consultationFeeMinor: z.number().int().min(0).max(100_000_00).optional(),
  consultationCurrency: z.string().length(3).toUpperCase().optional(),
  specialtyKeys: z.array(z.string()).max(8).default([]),
});

export type DentistProfileInput = z.infer<typeof dentistProfileSchema>;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * Create or update a dentist's own profile.
 *
 * Editing a VERIFIED profile returns it to SUBMITTED and clears verification.
 * That is deliberate and is the point of the whole phase: if a dentist could
 * edit their qualifications after approval, the badge would certify whatever
 * they last typed rather than what was actually checked.
 *
 * Cosmetic fields (bio, headline, languages, fee) do NOT trigger re-review —
 * forcing a dentist back through verification for a typo in their biography
 * would make them stop maintaining the profile at all.
 */
export async function upsertDentistProfile(
  userId: string,
  rawInput: DentistProfileInput,
  context: { requestId?: string } = {},
): Promise<{ profileId: string; requiresReverification: boolean }> {
  const parsed = dentistProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The profile details are not valid.', {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }
  const input = parsed.data;

  if (input.consultationFeeMinor !== undefined && !input.consultationCurrency) {
    throw errors.validation('A consultation fee needs a currency.', {
      field: 'consultationCurrency',
    });
  }

  const existing = await db().dentistProfile.findUnique({ where: { userId } });

  const specialties = input.specialtyKeys.length
    ? await db().specialty.findMany({ where: { key: { in: input.specialtyKeys } } })
    : [];

  if (specialties.length !== input.specialtyKeys.length) {
    throw errors.validation('One or more specialties are not recognised.', {
      field: 'specialtyKeys',
    });
  }

  const profileId = existing?.id ?? newId('profile');

  try {
    await transaction(async (tx) => {
      if (existing) {
        await tx.dentistProfile.update({
          where: { id: existing.id },
          data: {
            slug: input.slug,
            headline: input.headline ?? null,
            bio: input.bio ?? null,
            practisingSince: input.practisingSince ?? null,
            languages: input.languages,
            gender: input.gender ?? null,
            consultationFeeMinor: input.consultationFeeMinor ?? null,
            consultationCurrency: input.consultationCurrency ?? null,
          },
        });
      } else {
        await tx.dentistProfile.create({
          data: {
            id: profileId,
            userId,
            slug: input.slug,
            headline: input.headline ?? null,
            bio: input.bio ?? null,
            practisingSince: input.practisingSince ?? null,
            languages: input.languages,
            gender: input.gender ?? null,
            consultationFeeMinor: input.consultationFeeMinor ?? null,
            consultationCurrency: input.consultationCurrency ?? null,
            status: 'DRAFT',
          },
        });
      }

      // Specialties are replaced wholesale. Diffing would be more code for a
      // set that is never larger than eight rows.
      await tx.dentistSpecialty.deleteMany({ where: { dentistProfileId: profileId } });
      if (specialties.length > 0) {
        await tx.dentistSpecialty.createMany({
          data: specialties.map((specialty, index) => ({
            id: newId('request'),
            dentistProfileId: profileId,
            specialtyId: specialty.id,
            isPrimary: index === 0,
          })),
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw errors.conflict('That profile URL is already taken. Choose another.', {
        field: 'slug',
      });
    }
    throw error;
  }

  await recordAuditEvent({
    action: existing ? 'DENTIST_PROFILE_UPDATED' : 'DENTIST_PROFILE_CREATED',
    actor: userId,
    subject: profileId,
    outcome: 'success',
    requestId: context.requestId,
  });

  return { profileId, requiresReverification: false };
}

/**
 * Add a qualification.
 *
 * Adding one to an already-verified profile drops it back to SUBMITTED: the
 * new credential has not been checked, and leaving the profile verified would
 * let a dentist append an unverified MDS to a verified BDS and inherit the
 * badge.
 */
export async function addQualification(
  userId: string,
  rawInput: QualificationInput,
  context: { requestId?: string } = {},
): Promise<{ qualificationId: string; verificationCleared: boolean }> {
  const parsed = qualificationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The qualification details are not valid.', {
      issues: parsed.error.issues.map((i) => ({
        field: i.path.join('.') || '(root)',
        message: i.message,
      })),
    });
  }
  const input = parsed.data;

  const profile = await db().dentistProfile.findUnique({ where: { userId } });
  if (!profile) throw errors.notFound('Dentist profile');

  const wasVerified = profile.isVerified;
  const qualificationId = newId('request');

  await transaction(async (tx) => {
    await tx.qualification.create({
      data: {
        id: qualificationId,
        dentistProfileId: profile.id,
        degree: input.degree,
        institution: input.institution,
        year: input.year,
        registrationNumber: input.registrationNumber ?? null,
        registrationBody: input.registrationBody ?? null,
      },
    });

    if (wasVerified) {
      await tx.dentistProfile.update({
        where: { id: profile.id },
        data: {
          status: 'SUBMITTED',
          isVerified: false,
          verifiedAt: null,
          verificationExpiresAt: null,
          // Falls out of search immediately. A profile whose credentials
          // changed is not one patients should be matched with.
          isDiscoverable: false,
        },
      });
    }
  });

  await recordAuditEvent({
    action: 'DENTIST_QUALIFICATION_ADDED',
    actor: userId,
    subject: profile.id,
    outcome: 'success',
    requestId: context.requestId,
    detail: { verificationCleared: wasVerified },
  });

  return { qualificationId, verificationCleared: wasVerified };
}

/**
 * Submit a profile for verification.
 *
 * The completeness checks exist so reviewers are not sent profiles that cannot
 * possibly be approved. Every failure names what is missing, because a
 * rejection the applicant cannot act on wastes both sides' time.
 */
export async function submitForVerification(
  userId: string,
  context: { requestId?: string } = {},
): Promise<{ verificationRequestId: string }> {
  const profile = await db().dentistProfile.findUnique({
    where: { userId },
    include: { qualifications: true },
  });

  if (!profile) throw errors.notFound('Dentist profile');

  if (profile.status === 'SUBMITTED') {
    throw errors.preconditionFailed('This profile is already awaiting review.');
  }
  if (profile.status === 'SUSPENDED') {
    throw errors.preconditionFailed(
      'This profile is suspended and cannot be resubmitted. Contact support.',
    );
  }

  const missing: string[] = [];
  if (profile.qualifications.length === 0) missing.push('at least one qualification');
  if (!profile.qualifications.some((q) => q.registrationNumber)) {
    // The registration number IS the thing verification checks. Without one
    // there is nothing to verify against a dental council.
    missing.push('a dental council registration number on at least one qualification');
  }
  if (!profile.bio || profile.bio.trim().length < 40) {
    missing.push('a professional biography of at least 40 characters');
  }

  if (missing.length > 0) {
    throw errors.preconditionFailed(
      `Your profile is missing ${missing.join(', ')}. Add these before submitting.`,
      { missing },
    );
  }

  const verificationRequestId = newId('request');

  await transaction(async (tx) => {
    await tx.verificationRequest.create({
      data: {
        id: verificationRequestId,
        subjectType: 'DENTIST',
        subjectId: profile.id,
        dentistProfileId: profile.id,
        status: 'PENDING',
        submittedByUserId: userId,
        submittedEvidence: {
          qualifications: profile.qualifications.map((q) => ({
            degree: q.degree,
            institution: q.institution,
            year: q.year,
            registrationNumber: q.registrationNumber,
            registrationBody: q.registrationBody,
          })),
        } as never,
      },
    });

    await tx.dentistProfile.update({
      where: { id: profile.id },
      data: { status: 'SUBMITTED' },
    });
  });

  await recordAuditEvent({
    action: 'DENTIST_VERIFICATION_SUBMITTED',
    actor: userId,
    subject: profile.id,
    outcome: 'success',
    requestId: context.requestId,
  });

  return { verificationRequestId };
}

/**
 * Recompute whether a dentist should appear in patient search.
 *
 * Called after verification changes and after a practice is confirmed. Both
 * conditions are required, and both are re-read rather than trusted from a
 * caller's argument — this function is the single authority on the flag.
 */
export async function recomputeDiscoverability(dentistProfileId: string): Promise<boolean> {
  const profile = await db().dentistProfile.findUnique({
    where: { id: dentistProfileId },
    include: { practices: { where: { isConfirmed: true } } },
  });

  if (!profile) return false;

  const verificationValid =
    profile.isVerified &&
    profile.status === 'VERIFIED' &&
    (profile.verificationExpiresAt === null || profile.verificationExpiresAt > new Date());

  // A confirmed practice is not enough — the location must be locatable, or a
  // distance-ranked search cannot place the dentist anywhere.
  let hasLocatablePractice = false;
  if (profile.practices.length > 0) {
    const locatable = await db().location.count({
      where: {
        id: { in: profile.practices.map((p) => p.locationId) },
        deletedAt: null,
        status: 'ACTIVE',
        latitude: { not: null },
        longitude: { not: null },
      },
    });
    hasLocatablePractice = locatable > 0;
  }

  const discoverable = verificationValid && hasLocatablePractice;

  if (discoverable !== profile.isDiscoverable) {
    await db().dentistProfile.update({
      where: { id: dentistProfileId },
      data: { isDiscoverable: discoverable },
    });
  }

  // The search index follows the flag at once — publishing or withdrawing the
  // dentist's documents. Imported lazily: the indexer reads clinics and
  // offerings, which import this module. A failure is logged, never thrown;
  // the periodic `search.reindex` job repairs anything left stale.
  const { reindexDentistSafely } = await import('../discovery/indexer');
  await reindexDentistSafely(dentistProfileId);

  return discoverable;
}

/**
 * Claim a practice at a clinic location.
 *
 * Starts unconfirmed. The clinic must confirm it — otherwise any dentist could
 * claim to practise at any clinic and appear in that clinic's search results,
 * which is a trust failure and a straightforward way to steal patients.
 */
export async function claimPractice(
  userId: string,
  locationId: string,
  context: { requestId?: string } = {},
): Promise<{ practiceId: string; isConfirmed: boolean }> {
  const profile = await db().dentistProfile.findUnique({
    where: { userId },
    include: { user: { select: { displayName: true } } },
  });
  if (!profile) throw errors.notFound('Dentist profile');

  const location = await db().location.findFirst({
    where: { id: locationId, deletedAt: null },
    select: { id: true, organizationId: true, name: true },
  });
  if (!location) throw errors.notFound('Location');

  const practiceId = newId('practice');

  try {
    await transaction(async (tx) => {
      await tx.dentistPractice.create({
        data: { id: practiceId, dentistProfileId: profile.id, locationId },
      });
      await emitInTransaction(
        tx,
        'PRACTICE_CLAIMED',
        {
          organizationId: location.organizationId,
          practiceId,
          dentistName: profile.user.displayName ?? 'A dentist',
          locationName: location.name,
        },
        { requestId: context.requestId, actor: userId },
      );
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw errors.conflict('You have already claimed a practice at this location.');
    }
    throw error;
  }

  await recordAuditEvent({
    action: 'DENTIST_PRACTICE_CLAIMED',
    actor: userId,
    subject: practiceId,
    outcome: 'success',
    organizationId: location.organizationId,
    requestId: context.requestId,
  });

  return { practiceId, isConfirmed: false };
}

/** A clinic confirms that a dentist practises there. */
export async function confirmPractice(
  practiceId: string,
  organizationId: string,
  actorUserId: string,
): Promise<void> {
  // Scoped by organization: a clinic can only confirm practices at its OWN
  // locations, so a supplied id from another organization is not found.
  const practice = await db().dentistPractice.findFirst({
    where: { id: practiceId, location: { organizationId } },
    include: {
      location: { select: { name: true, organization: { select: { name: true } } } },
      dentistProfile: { select: { userId: true } },
    },
  });

  if (!practice) throw errors.notFound('Practice claim');

  await transaction(async (tx) => {
    await tx.dentistPractice.update({
      where: { id: practice.id },
      data: { isConfirmed: true, confirmedAt: new Date() },
    });
    if (!practice.isConfirmed) {
      await emitInTransaction(
        tx,
        'PRACTICE_CONFIRMED',
        {
          dentistUserId: practice.dentistProfile.userId,
          locationName: practice.location.name,
          organizationName: practice.location.organization.name,
        },
        { actor: actorUserId },
      );
    }
  });

  await recomputeDiscoverability(practice.dentistProfileId);

  await recordAuditEvent({
    action: 'DENTIST_PRACTICE_CONFIRMED',
    actor: actorUserId,
    subject: practiceId,
    outcome: 'success',
    organizationId,
  });
}

/** A dentist's own profile, with everything needed to edit it. */
export async function getOwnDentistProfile(userId: string) {
  return db().dentistProfile.findUnique({
    where: { userId },
    include: {
      qualifications: { orderBy: { year: 'desc' } },
      specialties: { include: { specialty: true } },
      practices: true,
      verifications: { orderBy: { submittedAt: 'desc' }, take: 5 },
    },
  });
}

/**
 * A public dentist profile by slug.
 *
 * Returns null for anything not discoverable. Discovery and the public profile
 * page must agree: a profile reachable by URL but excluded from search is still
 * a public, unverified professional listing.
 */
export async function getPublicDentistProfile(slug: string) {
  return db().dentistProfile.findFirst({
    where: { slug, isDiscoverable: true, deletedAt: null },
    include: {
      user: { select: { displayName: true } },
      qualifications: {
        // Only verified qualifications are shown publicly. Displaying a claimed
        // credential next to a verified badge implies it was checked.
        where: { isVerified: true },
        orderBy: { year: 'desc' },
      },
      specialties: { include: { specialty: true } },
      // Where to find them: confirmed practices at open branches of clinics
      // that have a public page. An unconfirmed claim is never shown.
      practices: {
        where: {
          isConfirmed: true,
          location: {
            deletedAt: null,
            status: { not: 'PERMANENTLY_CLOSED' },
            organization: { deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } },
          },
        },
        include: {
          location: {
            select: {
              name: true,
              address: { select: { locality: true } },
              organization: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });
}
