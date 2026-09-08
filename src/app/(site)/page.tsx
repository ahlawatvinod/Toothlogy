/**
 * TL-PAGE-HOME-001 — /
 *
 * The public entry point.
 *
 * It states what genuinely works today and what does not. That is not modesty
 * — a landing page advertising appointment booking that cannot book an
 * appointment converts a visitor into someone who distrusts the product
 * (Constitution P9).
 *
 * The build-status figures are read from the registry at render time rather
 * than typed in, so they cannot drift from what the code actually contains.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { registrySummary } from '@/registry';
import { PILLARS } from '@/registry/types';
import { Badge, Card, CardBody, CardHeader } from '@/design-system';

export const metadata: Metadata = {
  title: 'Toothlogy — find the right dentist',
  description:
    'Toothlogy connects patients, dentists, clinics, colleges, students and suppliers. Find the right dentist at the right time, and give practices the tools to be found.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Toothlogy — find the right dentist',
    description:
      'A global dental ecosystem connecting patients, dentists, clinics, colleges, students and suppliers.',
    type: 'website',
  },
};

export default function HomePage() {
  const summary = registrySummary();

  return (
    <div className="tl-container">
      <section className="tl-hero">
        <h1>Help every good dentist get discovered by the right patient.</h1>
        <p className="tl-hero__lead">
          Toothlogy is a global dental ecosystem connecting patients, dentists, clinics,
          colleges, students and suppliers — built so competence is discoverable, not just
          marketing budgets.
        </p>
        <div className="tl-hero__actions">
          <Link className="tl-button tl-button--primary tl-button--lg" href="/register">
            Create an account
          </Link>
          <Link
            className="tl-button tl-button--secondary tl-button--lg"
            href="/register?role=dentist"
          >
            List your practice
          </Link>
        </div>
      </section>

      <section aria-labelledby="pillars-heading" className="tl-page">
        <h2 id="pillars-heading">The five pillars</h2>
        <p className="tl-muted" style={{ maxWidth: '68ch' }}>
          Every feature must map to at least one. A feature that maps to none does not belong —
          and the architecture enforces that rather than trusting discipline.
        </p>
        <div style={{ display: 'flex', gap: 'var(--tl-space-2)', flexWrap: 'wrap' }}>
          {PILLARS.map((pillar) => (
            <Badge key={pillar} tone="brand">
              {pillar}
            </Badge>
          ))}
        </div>
      </section>

      <section aria-labelledby="status-heading" className="tl-page">
        <h2 id="status-heading">What works today</h2>

        <div className="tl-card-grid">
          <Card label="Available now">
            <CardHeader>
              <div className="tl-card__title-row">
                <strong>Available now</strong>
                <Badge tone="success">Working</Badge>
              </div>
            </CardHeader>
            <CardBody>
              <ul className="tl-list">
                <li>
                  <strong>Accounts</strong>
                  <span className="tl-list__meta">
                    Registration, sign-in, sessions, password reset, account deletion
                  </span>
                </li>
                <li>
                  <strong>Organizations</strong>
                  <span className="tl-list__meta">
                    Clinics and suppliers, members, invitations, branches, opening hours
                  </span>
                </li>
                <li>
                  <strong>Security</strong>
                  <span className="tl-list__meta">
                    Device management, audit trail, role-based access control
                  </span>
                </li>
              </ul>
            </CardBody>
          </Card>

          <Card label="Not built yet">
            <CardHeader>
              <div className="tl-card__title-row">
                <strong>Not built yet</strong>
                <Badge tone="warning">Later phases</Badge>
              </div>
            </CardHeader>
            <CardBody>
              <p className="tl-muted">
                Dentist discovery, appointment booking, dental records, messaging, reviews and
                the marketplace are designed and registered but not implemented. They are listed
                here rather than advertised as working.
              </p>
            </CardBody>
          </Card>

          <Card label="Architecture">
            <CardHeader>
              <strong>Architecture</strong>
            </CardHeader>
            <CardBody>
              <dl className="tl-registry-grid">
                <div className="tl-stat">
                  <dt className="tl-stat__label">Divisions</dt>
                  <dd className="tl-stat__value">{summary.divisions.total}</dd>
                </div>
                <div className="tl-stat">
                  <dt className="tl-stat__label">Modules</dt>
                  <dd className="tl-stat__value">
                    {summary.modules.total}
                    <span className="tl-stat__detail">{summary.modules.implemented} built</span>
                  </dd>
                </div>
                <div className="tl-stat">
                  <dt className="tl-stat__label">APIs</dt>
                  <dd className="tl-stat__value">{summary.apis.total}</dd>
                </div>
                <div className="tl-stat">
                  <dt className="tl-stat__label">Entities</dt>
                  <dd className="tl-stat__value">{summary.entities.total}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
