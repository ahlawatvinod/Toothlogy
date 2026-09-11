/**
 * TL-PAGE-ADMINVERIFY-001 — /admin/verification
 *
 * Staff review console. Gated on `tl.verification.request.review`, and 404s
 * rather than 403s for anyone else — telling an unauthorised visitor that an
 * admin console exists at this path is itself a disclosure.
 *
 * Three kinds of request share the queue: dentist credentials, organization
 * registrations and clinic-listing claims. Each is shown with what that kind
 * of decision needs, and every date is formatted here, on the server.
 */

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import { listPendingVerificationsForReview } from '@/platform/verification/service';
import { ReviewQueue, type PendingRequest } from './review-queue';

export const metadata: Metadata = {
  title: 'Verification queue',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function VerificationQueuePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login');
  if (!(await currentUserCan('tl.verification.request.review'))) notFound();

  const [pending, viewer] = await Promise.all([
    listPendingVerificationsForReview(),
    db().user.findUnique({ where: { id: principal.userId }, select: { locale: true, timezone: true } }),
  ]);
  const formatDate = (d: Date) =>
    new Intl.DateTimeFormat(viewer?.locale ?? 'en-IN', {
      dateStyle: 'medium',
      timeZone: viewer?.timezone ?? 'Asia/Kolkata',
    }).format(d);

  const requests: PendingRequest[] = pending.map(({ request, organization, submitter, documents, claimRole, note }) => ({
    id: request.id,
    kind:
      request.subjectType === 'ORGANIZATION_CLAIM'
        ? 'claim'
        : request.subjectType === 'ORGANIZATION'
          ? 'organization'
          : 'dentist',
    submittedLabel: formatDate(request.submittedAt),
    isOwnRequest: request.submittedByUserId === principal.userId,
    submitter: submitter ? { name: submitter.displayName, email: submitter.email } : null,
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
    organization: organization
      ? {
          name: organization.name,
          slug: organization.slug,
          type: organization.type,
          countryCode: organization.countryCode,
          registrationNumber: organization.registrationNumber,
          taxIdentifier: organization.taxIdentifier,
          locations: organization._count.locations,
          alreadyOwned: organization.ownerUserId !== null,
        }
      : null,
    claimRole,
    note,
    documents,
  }));

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>Verification queue</h1>
        <p className="tl-page__lead">
          Check each registration number against the issuing register, and open every document, before approving. You
          cannot decide your own application.
        </p>
      </header>

      <ReviewQueue requests={requests} />
    </div>
  );
}
