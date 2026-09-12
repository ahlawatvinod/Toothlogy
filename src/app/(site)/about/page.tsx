/**
 * TL-PAGE-ABOUT-001 — /about
 *
 * What Toothlogy is for, in the founder's words: the vision, the mission, the
 * objectives, and the National Dental Care Movement it works toward. The
 * commitments that follow are the Constitution's, restated for a public
 * audience — they are promises to users, so users should be able to read them
 * without reading the repository. "Where we are" says plainly what works
 * today; it is updated as the build moves, never ahead of it.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/design-system';

export const metadata: Metadata = {
  title: 'About Toothlogy',
  description:
    'Toothlogy is a digital dental-care platform connecting patients with trusted dentists, clinics, treatments and dental-care information. Founded by Laayra Ahlawat.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Toothlogy',
    description: 'A connected dental-care ecosystem for patients, dentists, clinics and the wider dental community.',
    type: 'website',
  },
};

const OBJECTIVES = [
  ['Improve access to dental care', 'Help people discover and connect with dentists, clinics and dental services easily.'],
  ['Promote preventive dental care', 'Encourage regular dental check-ups, oral hygiene, early diagnosis and preventive treatment.'],
  ['Increase dental awareness', 'Provide reliable and easy-to-understand information about oral health and dental treatments.'],
  ['Empower dental professionals', 'Provide digital tools that help dentists and clinics manage their services, patients, appointments and professional presence.'],
  ['Build a connected dental ecosystem', 'Bring patients, dentists, clinics, institutions, organizations and the dental industry together on one platform.'],
  ['Support community dental initiatives', 'Conduct and support dental awareness, screening and care programmes across communities.'],
  ['Make dental care patient-centric', 'Focus on transparency, convenience, accessibility, trust and better patient experiences.'],
  ['Work toward 100 crore smiles', 'Support the National Dental Care Movement — “100 Crore Smiles” — with the vision of healthy teeth and confident smiles for every citizen.'],
] as const;

const COMMITMENTS = [
  {
    title: 'Merit ranks above spend',
    body: 'Paid placement is allowed and is labelled as such, everywhere it appears — including in our API responses. Placement that is indistinguishable from organic ranking is not something we will build.',
  },
  {
    title: 'You own your health data',
    body: 'Dental records belong to the patient. A clinic holds only the access you grant: time-limited, revocable and audited, and you can see every time someone looks. Export is a right, not a feature we might add.',
  },
  {
    title: 'Verification is revocable',
    body: 'A verified badge has evidence behind it, a verifier, a date and an expiry. A badge that cannot be withdrawn is not a verification.',
  },
  {
    title: 'We do not diagnose',
    body: 'Toothlogy helps you find and reach a dentist, and explains what things mean. Clinical conclusions come from licensed clinicians. Where we use AI, it is labelled, and it never gives advice or a diagnosis.',
  },
];

/** Names the organization and its founder for search engines; `<` escaped, as everywhere. */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  mainEntity: {
    '@type': 'Organization',
    name: 'Toothlogy',
    description:
      'A digital dental-care platform connecting patients with trusted dental professionals, clinics, treatments and dental-care information.',
    founder: { '@type': 'Person', name: 'Laayra Ahlawat', jobTitle: 'Founder' },
    areaServed: 'IN',
  },
};

export default function AboutPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c') }} />

      <header className="tl-page__header">
        <h1>About Toothlogy</h1>
        <p className="tl-page__lead">
          A digital dental-care platform dedicated to making quality dental care more accessible,
          convenient and understandable for everyone.
        </p>
        <p className="tl-muted">
          Founded by <strong>Laayra Ahlawat</strong>, Founder, Toothlogy.
        </p>
      </header>

      <div className="tl-prose">
        <p>
          Toothlogy is a digital dental-care platform dedicated to making quality dental care more
          accessible, convenient and understandable for everyone. Our vision is to connect people
          with trusted dental professionals, clinics, treatments and dental-care information through
          one simple platform. Whether you are looking for a dentist, exploring treatment options,
          comparing dental services or learning how to maintain better oral health, Toothlogy is
          designed to make your dental journey easier.
        </p>
        <p>
          Our mission is to build a connected dental-care ecosystem that benefits patients, dentists,
          clinics and the wider dental community. We aim to help patients discover and access dental
          services while empowering dentists and dental clinics with digital tools to manage their
          presence, services, appointments, patients and professional growth. Through technology,
          structured information and responsible healthcare practices, Toothlogy works toward
          creating a more transparent and patient-friendly dental-care experience.
        </p>
        <p>
          At Toothlogy, we believe that healthy teeth should be accessible to every citizen. Our
          long-term vision is to contribute to a healthier India by increasing awareness, encouraging
          preventive dental care and helping people seek professional care at the right time. Through
          initiatives such as the National Dental Care Movement — <strong>“100 Crore Smiles”</strong>{' '}
          — Toothlogy aims to spread the message that oral health is an essential part of overall
          well-being, and that every citizen deserves healthy teeth and a confident smile.
        </p>
      </div>

      <section aria-labelledby="vision-heading">
        <h2 id="vision-heading">Our vision</h2>
        <div className="tl-prose">
          <p>
            To create a healthier society where every citizen has access to quality dental care,
            trusted dental professionals, and the knowledge needed to maintain healthy teeth and
            gums. Toothlogy envisions becoming a comprehensive digital dental-care ecosystem that
            connects patients, dentists, clinics, dental institutions and the dental industry through
            technology, accessibility and awareness.
          </p>
        </div>
      </section>

      <section aria-labelledby="mission-heading">
        <h2 id="mission-heading">Our mission</h2>
        <div className="tl-prose">
          <p>
            Our mission is to simplify and improve the dental-care journey for everyone. Toothlogy
            aims to connect patients with qualified dental professionals and services, promote
            preventive oral healthcare, provide reliable dental information, and empower dentists and
            clinics with modern digital tools. Through technology, awareness campaigns and community
            initiatives, we strive to make dental care more accessible, transparent, convenient and
            patient-focused.
          </p>
        </div>
      </section>

      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">Our objectives</h2>
        <ol className="tl-prose">
          {OBJECTIVES.map(([title, body]) => (
            <li key={title}>
              <strong>{title}</strong> — {body}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="commitments-heading">
        <h2 id="commitments-heading">What we commit to</h2>
        <div className="tl-card-grid">
          {COMMITMENTS.map((commitment) => (
            <Card key={commitment.title} label={commitment.title}>
              <CardHeader>
                <strong>{commitment.title}</strong>
              </CardHeader>
              <CardBody>
                <p className="tl-muted" style={{ margin: 0 }}>
                  {commitment.body}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Where we are</h2>
        <div className="tl-prose">
          <p>
            Toothlogy is under active construction, and we say plainly what works. You can{' '}
            <Link href="/find">find a verified dentist</Link> and book an appointment, keep your own{' '}
            <Link href="/account/records">dental record</Link> and share it with a clinic on your
            terms, read <Link href="/knowledge">clinically reviewed explanations</Link>, ask the{' '}
            <Link href="/community">community</Link>, browse the{' '}
            <Link href="/marketplace">dental marketplace</Link>, and explore{' '}
            <Link href="/colleges">colleges</Link> and <Link href="/careers">careers</Link>.
          </p>
          <p>
            What is not connected yet, we do not pretend is: online payment, email, SMS and WhatsApp
            messages, video consultations, street-level maps and AI features wait on providers, and
            say so wherever they appear rather than failing quietly. The concern router at{' '}
            <Link href="/which-dentist">“Which dentist should I see?”</Link> follows fixed rules, not
            AI, and awaits review by a clinical reviewer.
          </p>
        </div>
      </section>
    </div>
  );
}
