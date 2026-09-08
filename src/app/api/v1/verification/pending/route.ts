/**
 * TL-API-VERIFY-PENDING-001 — GET /api/v1/verification/pending
 *
 * The review queue. Oldest first, so a backlog drains in the order it
 * accumulated rather than starving the applicants who have waited longest.
 */

import { listPendingVerifications } from '@/platform/verification/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-VERIFY-PENDING-001',
  permissions: ['tl.verification.request.review'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  // A privileged read of applicants' credentials is worth recording.
  audit: true,
  handler: async () => {
    const pending = await listPendingVerifications();

    return {
      requests: pending.map((request) => ({
        id: request.id,
        subjectType: request.subjectType,
        subjectId: request.subjectId,
        status: request.status,
        submittedAt: request.submittedAt,

        dentist: request.dentistProfile
          ? {
              profileId: request.dentistProfile.id,
              slug: request.dentistProfile.slug,
              displayName: request.dentistProfile.user.displayName,
              email: request.dentistProfile.user.email,
              // The registration numbers are the point of the review: they are
              // what the reviewer checks against the dental council register.
              qualifications: request.dentistProfile.qualifications.map((q) => ({
                degree: q.degree,
                institution: q.institution,
                year: q.year,
                registrationNumber: q.registrationNumber,
                registrationBody: q.registrationBody,
              })),
            }
          : null,
      })),
    };
  },
});
