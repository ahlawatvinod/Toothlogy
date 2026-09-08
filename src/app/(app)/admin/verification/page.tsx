/**
 * TL-PAGE-ADMINVERIFY-001 — /admin/verification
 *
 * Staff review console. Gated on `tl.verification.request.review`, and 404s
 * rather than 403s for anyone else — telling an unauthorised visitor that an
 * admin console exists at this path is itself a disclosure.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { listPendingVerifications } from '@/platform/verification/service';
import { ReviewQueue } from './review-queue';

export const metadata: Metadata = {
  title: 'Verification queue',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function VerificationQueuePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login');
  if (!(await currentUserCan('tl.verification.request.review'))) notFound();

  const pending = await listPendingVerifications();

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Verification queue</h1>
        <p className="tl-page__lead">
          Check each registration number against the issuing council&rsquo;s public register
          before approving. You cannot decide your own application.
        </p>
      </header>

      <ReviewQueue
        requests={pending.map((request) => ({
          id: request.id,
          submittedAt: request.submittedAt.toISOString(),
          dentist: request.dentistProfile
            ? {
                profileId: request.dentistProfile.id,
                slug: request.dentistProfile.slug,
                displayName: request.dentistProfile.user.displayName,
                email: request.dentistProfile.user.email,
                qualifications: request.dentistProfile.qualifications.map((q) => ({
                  degree: q.degree,
                  institution: q.institution,
                  year: q.year,
                  registrationNumber: q.registrationNumber,
                  registrationBody: q.registrationBody,
                })),
              }
            : null,
        }))}
      />
    </div>
  );
}
