/**
 * TL-API-DENTIST-ME-GET-001 — GET  /api/v1/dentists/me
 * TL-API-DENTIST-ME-PUT-001 — PUT  /api/v1/dentists/me
 *
 * A dentist's own profile. Scoped to `self` throughout: the user id comes from
 * the session, never from the request, so there is no id to tamper with and no
 * IDOR to write.
 */

import {
  dentistProfileSchema,
  getOwnDentistProfile,
  upsertDentistProfile,
} from '@/platform/dentists/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-DENTIST-ME-GET-001',
  permissions: ['tl.dentist.profile.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const profile = await getOwnDentistProfile(principal.userId);

    // Null rather than 404: "you have not created a profile yet" is a normal
    // state for a dentist who has just registered, and the client renders an
    // empty form for it rather than an error.
    if (!profile) return { profile: null };

    return {
      profile: {
        id: profile.id,
        slug: profile.slug,
        headline: profile.headline,
        bio: profile.bio,
        practisingSince: profile.practisingSince,
        languages: profile.languages,
        gender: profile.gender,
        consultationFeeMinor: profile.consultationFeeMinor,
        consultationCurrency: profile.consultationCurrency,
        status: profile.status,
        isVerified: profile.isVerified,
        verifiedAt: profile.verifiedAt,
        verificationExpiresAt: profile.verificationExpiresAt,
        // Surfaced so a dentist can see WHY they are not appearing in search.
        isDiscoverable: profile.isDiscoverable,

        qualifications: profile.qualifications.map((q) => ({
          id: q.id,
          degree: q.degree,
          institution: q.institution,
          year: q.year,
          registrationNumber: q.registrationNumber,
          registrationBody: q.registrationBody,
          isVerified: q.isVerified,
        })),

        specialties: profile.specialties.map((s) => ({
          key: s.specialty.key,
          name: s.specialty.name,
          isPrimary: s.isPrimary,
        })),

        practices: profile.practices.map((p) => ({
          id: p.id,
          locationId: p.locationId,
          isConfirmed: p.isConfirmed,
        })),

        verificationHistory: profile.verifications.map((v) => ({
          id: v.id,
          status: v.status,
          submittedAt: v.submittedAt,
          reviewedAt: v.reviewedAt,
          // The applicant sees the decision reason but never the internal
          // reviewer notes.
          decisionReason: v.decisionReason,
        })),
      },
    };
  },
});

export const PUT = defineRoute({
  id: 'TL-API-DENTIST-ME-PUT-001',
  permissions: ['tl.dentist.profile.manage.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: dentistProfileSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await upsertDentistProfile(principal.userId, body, { requestId });
    return { profileId: result.profileId, saved: true };
  },
});
