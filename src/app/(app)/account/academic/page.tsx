/**
 * TL-PAGE-MY-ACADEMIC-001 — /account/academic
 *
 * The person's researcher and faculty profiles: details, publications, and
 * (faculty) posts at colleges with their confirmation status.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { ACADEMIC_TYPES, myAcademic } from '@/platform/academic/service';
import { DENTAL_SPECIALTIES } from '@/platform/dentists/specialties';
import { db } from '@/platform/db/client';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';
import { AcademicProfileForm, AppointmentRequest, EndAppointment, PublicationForm, RemovePublication } from './academic-forms';

export const metadata: Metadata = { title: 'Academic profile', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function MyAcademicPage() {
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect('/login?next=/account/academic');
  const [profiles, colleges] = await Promise.all([
    myAcademic(principal),
    db().organization.findMany({ where: { type: 'COLLEGE', deletedAt: null, ownerUserId: { not: null } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 }),
  ]);
  const interests = DENTAL_SPECIALTIES.map((s) => ({ key: s.key, name: s.name }));

  return (
    <div className="tl-page">
      <header className="tl-page__header">
        <h1>Academic profile</h1>
        <p className="tl-page__lead">
          For researchers and faculty. Public profiles are listed under <Link href="/academics">Researchers and faculty</Link>; what you write is shown as your own statement.
        </p>
      </header>
      {ACADEMIC_TYPES.map((type) => {
        const profile = profiles.find((p) => p.type === type);
        const label = type === 'FACULTY' ? 'Faculty profile' : 'Researcher profile';
        return (
          <Card key={type} label={label}>
            <CardHeader>
              <div className="tl-card__title-row">
                <strong>{label}</strong>
                {profile ? <Badge tone={profile.isPublic ? 'success' : 'neutral'}>{profile.isPublic ? 'public' : 'private'}</Badge> : null}
                {profile?.isPublic && profile.slug ? <Link href={`/${type === 'FACULTY' ? 'faculty' : 'researchers'}/${profile.slug}`}>View</Link> : null}
              </div>
            </CardHeader>
            <CardBody>
              <div className="tl-stack">
                <AcademicProfileForm
                  type={type}
                  interests={interests}
                  profile={{
                    displayName: profile?.displayName ?? '',
                    headline: profile?.headline ?? '',
                    bio: profile?.bio ?? '',
                    isPublic: profile?.isPublic ?? false,
                    designation: profile?.academic?.designation ?? '',
                    department: profile?.academic?.department ?? '',
                    institution: profile?.academic?.institution ?? '',
                    orcid: profile?.academic?.orcid ?? '',
                    website: profile?.academic?.website ?? '',
                    interests: profile?.academic?.interests ?? [],
                  }}
                />
                {profile ? (
                  <>
                    <strong>Publications</strong>
                    <ul className="tl-list" aria-label={`${label} publications`}>
                      {profile.publications.map((p) => (
                        <li key={p.id} className="tl-inline" style={{ flexWrap: 'wrap' }}>
                          <span>
                            {p.title} ({[p.venue, p.year].filter(Boolean).join(', ')})
                          </span>
                          <RemovePublication publicationId={p.id} />
                        </li>
                      ))}
                    </ul>
                    <PublicationForm type={type} />
                  </>
                ) : null}
                {profile && type === 'FACULTY' ? (
                  <>
                    <strong>Posts at colleges</strong>
                    <ul className="tl-list" aria-label="Posts at colleges">
                      {profile.facultyAppointments.map((f) => (
                        <li key={f.id} className="tl-inline" style={{ flexWrap: 'wrap' }}>
                          <span>
                            {f.designation} — {f.organization.name}
                          </span>
                          <Badge tone={f.status === 'CONFIRMED' ? 'success' : f.status === 'PENDING' ? 'info' : 'neutral'}>{f.status === 'PENDING' ? 'waiting for the college' : f.status.toLowerCase()}</Badge>
                          {f.status === 'CONFIRMED' ? <EndAppointment appointmentId={f.id} /> : null}
                        </li>
                      ))}
                    </ul>
                    <AppointmentRequest colleges={colleges} />
                  </>
                ) : null}
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
