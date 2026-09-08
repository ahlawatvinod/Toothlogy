/**
 * TL-PAGE-ABOUT-001 — /about
 *
 * Real content, not a placeholder: what Toothlogy is for, and the principles it
 * commits to. Those principles are the Constitution's, restated for a public
 * audience — they are commitments to users, so users should be able to read
 * them without reading the repository.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/design-system';

export const metadata: Metadata = {
  title: 'About Toothlogy',
  description:
    'Toothlogy connects patients, dentists, clinics, colleges, students and suppliers — built so competence is discoverable, not just marketing budgets.',
  robots: { index: true, follow: true },
};

const PRINCIPLES = [
  {
    title: 'Merit ranks above spend',
    body: 'Paid placement is allowed and is labelled as such, everywhere it appears — including in our API responses. Placement that is indistinguishable from organic ranking is not something we will build.',
  },
  {
    title: 'You own your health data',
    body: 'Dental records belong to the patient. Clinics hold access you grant, which is time-limited, revocable and audited. Export is a right, not a feature we might add.',
  },
  {
    title: 'Verification is revocable',
    body: 'A verified badge has evidence behind it, a verifier, a date and an expiry. A badge that cannot be withdrawn is not a verification.',
  },
  {
    title: 'We do not diagnose',
    body: 'Toothlogy helps you find and reach a dentist, and explains what things mean. Clinical conclusions come from licensed clinicians. Where we use AI, it is labelled, and it never issues clinical advice.',
  },
];

export default function AboutPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>About Toothlogy</h1>
        <p className="tl-page__lead">
          Help every good dentist get discovered by the right patient at the right time, while
          giving patients a trusted end-to-end dental experience.
        </p>
      </header>

      <div className="tl-prose">
        <p>
          A good dentist without a marketing budget should still be findable by the patient who
          needs exactly them. That is the problem Toothlogy exists to solve, and it has two
          halves that we refuse to trade off against each other: competence should be
          discoverable, and the journey from &ldquo;my tooth hurts&rdquo; to &ldquo;I am treated
          and I have my records&rdquo; should be trustworthy at every step.
        </p>
        <p>
          Toothlogy serves patients, dentists, clinics and hospitals, dental colleges, students
          and interns, employers, researchers, authors, manufacturers, distributors, wholesalers,
          retailers, suppliers and service providers. Each is a first-class part of the system
          rather than an afterthought bolted onto a patient app.
        </p>
      </div>

      <section aria-labelledby="principles-heading">
        <h2 id="principles-heading">What we commit to</h2>
        <div className="tl-card-grid">
          {PRINCIPLES.map((principle) => (
            <Card key={principle.title} label={principle.title}>
              <CardHeader>
                <strong>{principle.title}</strong>
              </CardHeader>
              <CardBody>
                <p className="tl-muted" style={{ margin: 0 }}>
                  {principle.body}
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
            Toothlogy is under active construction, and we say plainly what works. Accounts,
            organizations, branches and security are built and running. Dentist discovery,
            appointment booking, records, messaging and the marketplace are designed but not yet
            implemented — and we do not show mock-ups of them, because on a health platform a
            fake result is worse than no result.
          </p>
          <p>
            <Link href="/">See the current build status</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
