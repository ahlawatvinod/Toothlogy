/**
 * TL-PAGE-DENTISTPUBLIC-001 — /dentists/:slug
 *
 * The public professional profile — the page the DISCOVER pillar exists to send
 * patients to.
 *
 * Two rules it enforces:
 *
 * 1. **Only discoverable dentists resolve.** `getPublicDentistProfile` returns
 *    null for anything unverified, so a profile reachable by URL but excluded
 *    from search cannot exist. Otherwise an unverified dentist could share a
 *    direct link and present as listed on Toothlogy.
 * 2. **Only verified qualifications are shown.** Displaying a claimed credential
 *    beside a verified badge implies it was checked.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicDentistProfile } from '@/platform/dentists/service';
import { formatMoney, money } from '@/platform/money';
import { LANGUAGE_BY_CODE } from '@/registry/globalization';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) {
    return { title: 'Dentist not found', robots: { index: false, follow: false } };
  }

  const name = profile.user.displayName ?? 'Dentist';

  return {
    title: `${name} — verified dentist on Toothlogy`,
    description:
      profile.headline ??
      `${name} is a verified dentist on Toothlogy. View qualifications, specialties and languages.`,
    // Indexable: this is exactly the content the DISCOVER pillar wants found,
    // and it only exists for verified dentists.
    robots: { index: true, follow: true },
    openGraph: {
      title: `${name} — verified dentist`,
      description: profile.headline ?? undefined,
      type: 'profile',
    },
  };
}

export default async function PublicDentistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicDentistProfile(slug);

  if (!profile) notFound();

  const name = profile.user.displayName ?? 'Dentist';
  const yearsPractising = profile.practisingSince
    ? new Date().getFullYear() - profile.practisingSince
    : null;

  /*
   * Structured data so search engines can render a rich result. Emitted only
   * for verified dentists — publishing Physician markup for an unverified
   * profile would be a false credential claim to every search engine that reads
   * it, which is a considerably worse version of showing it on our own site.
   */
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name,
    description: profile.bio ?? profile.headline ?? undefined,
    knowsLanguage: profile.languages.map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code),
    medicalSpecialty: profile.specialties.map((s) => s.specialty.name),
  };

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '46rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="tl-page__header">
        <div className="tl-card__title-row">
          <h1>{name}</h1>
          <Badge tone="success">Verified</Badge>
        </div>
        {profile.headline ? <p className="tl-page__lead">{profile.headline}</p> : null}
        <p className="tl-muted">
          {yearsPractising !== null ? `${yearsPractising} years practising · ` : ''}
          {profile.languages
            .map((code) => LANGUAGE_BY_CODE.get(code)?.name ?? code)
            .join(', ')}
        </p>
      </header>

      {profile.bio ? (
        <div className="tl-prose">
          <p>{profile.bio}</p>
        </div>
      ) : null}

      {profile.specialties.length > 0 ? (
        <Card label="Specialties">
          <CardHeader>
            <strong>Specialties</strong>
          </CardHeader>
          <CardBody>
            <ul className="tl-list">
              {profile.specialties.map((s) => (
                <li key={s.specialty.key}>
                  <strong>{s.specialty.name}</strong>
                  <span className="tl-list__meta">{s.specialty.description}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Card label="Verified qualifications">
        <CardHeader>
          <strong>Verified qualifications</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            Each of these has been checked against the issuing council&rsquo;s register.
          </p>
          <ul className="tl-list">
            {profile.qualifications.map((q) => (
              <li key={q.id}>
                <div className="tl-card__title-row">
                  <strong>
                    {q.degree} — {q.institution}
                  </strong>
                  <Badge tone="success">Verified</Badge>
                </div>
                <span className="tl-list__meta">
                  {q.year}
                  {q.registrationBody ? ` · ${q.registrationBody}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {profile.consultationFeeMinor !== null && profile.consultationCurrency ? (
        <Card label="Consultation fee">
          <CardHeader>
            <strong>Consultation fee</strong>
          </CardHeader>
          <CardBody>
            <p style={{ fontSize: 'var(--tl-text-xl)', margin: 0 }}>
              {formatMoney(
                money(BigInt(profile.consultationFeeMinor), profile.consultationCurrency),
                'en-IN',
              )}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/*
       * Booking is Phase 4. Saying so is better than a button that does
       * nothing, and far better than one that appears to book an appointment.
       */}
      <Card label="Booking">
        <CardHeader>
          <div className="tl-card__title-row">
            <strong>Booking</strong>
            <Badge tone="warning">Not available yet</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <p className="tl-muted" style={{ margin: 0 }}>
            Online appointment booking is not built yet. It arrives in Phase 4, together with
            availability and reminders.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
