/**
 * TL-PAGE-DENTISTPROFILE-001 — /account/dentist-profile
 *
 * Gated on the dentist permission rather than on a role string. Checking
 * `roles.includes('dentist')` in a page would drift from the API's permission
 * check the moment either side changes; asking the same authorization layer the
 * API asks means they cannot disagree.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal, currentUserCan } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getOwnDentistProfile } from '@/platform/dentists/service';
import { db } from '@/platform/db/client';
import { ProfileEditor } from './profile-editor';

export const metadata: Metadata = {
  title: 'Your dentist profile',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function DentistProfilePage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login');

  if (!(await currentUserCan('tl.dentist.profile.manage.self'))) notFound();

  const [profile, specialties] = await Promise.all([
    getOwnDentistProfile(principal.userId),
    db().specialty.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb">
        <Link href="/account">Account</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Dentist profile</span>
      </nav>

      <header className="tl-page__header">
        <h1>Your dentist profile</h1>
        <p className="tl-page__lead">
          This is what patients see, and what determines whether they find you at all.
        </p>
      </header>

      <ProfileEditor
        // Serialised for the client boundary: Dates do not cross it as Dates.
        profile={
          profile
            ? {
                id: profile.id,
                slug: profile.slug,
                headline: profile.headline,
                bio: profile.bio,
                practisingSince: profile.practisingSince,
                languages: profile.languages,
                consultationFeeMinor: profile.consultationFeeMinor,
                consultationCurrency: profile.consultationCurrency,
                status: profile.status,
                isVerified: profile.isVerified,
                isDiscoverable: profile.isDiscoverable,
                qualifications: profile.qualifications.map((q) => ({
                  id: q.id,
                  degree: q.degree,
                  institution: q.institution,
                  year: q.year,
                  registrationNumber: q.registrationNumber,
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
                  submittedAt: v.submittedAt.toISOString(),
                  reviewedAt: v.reviewedAt?.toISOString() ?? null,
                  decisionReason: v.decisionReason,
                })),
              }
            : null
        }
        specialties={specialties.map((s) => ({
          key: s.key,
          name: s.name,
          description: s.description,
        }))}
      />
    </div>
  );
}
