/**
 * TL-PAGE-CONTACT-001 — /contact
 *
 * There is deliberately NO contact form here.
 *
 * A form that posts to an endpoint with no email provider configured would
 * accept a message, show "thank you, we'll be in touch", and silently discard
 * it. For a health platform that is a genuinely harmful lie — someone reporting
 * a safety concern would believe they had reported it.
 *
 * The support ticket system (Division 30, Phase 5) will store messages durably,
 * at which point a form here becomes truthful and this page changes.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Card, CardBody, CardHeader } from '@/design-system';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'How to reach Toothlogy.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '44rem' }}>
      <header className="tl-page__header">
        <h1>Contact</h1>
      </header>

      <Alert tone="danger" title="Dental emergency?">
        Do not use this page. If you have severe pain, swelling, uncontrolled bleeding,
        difficulty breathing or swallowing, or an injury to the face or jaw, seek emergency
        dental or medical care immediately.
      </Alert>

      <Card label="Contact status">
        <CardHeader>
          <strong>Messaging is not connected yet</strong>
        </CardHeader>
        <CardBody>
          <p className="tl-muted">
            There is no contact form on this page on purpose. No email provider is configured, so
            a form here would accept your message, tell you it had been sent, and lose it. We are
            not willing to do that — particularly not for someone reporting a safety concern.
          </p>
          <p className="tl-muted" style={{ marginBlockEnd: 0 }}>
            Support tickets with tracked resolution and escalation arrive in Phase 5. When
            messages can be stored and answered, a form will appear here.
          </p>
        </CardBody>
      </Card>

      <Card label="In the meantime">
        <CardHeader>
          <strong>What you can do now</strong>
        </CardHeader>
        <CardBody>
          <div className="tl-hero__actions">
            <Link className="tl-button tl-button--secondary tl-button--md" href="/about">
              About Toothlogy
            </Link>
            <Link className="tl-button tl-button--secondary tl-button--md" href="/privacy">
              Privacy
            </Link>
            <Link className="tl-button tl-button--secondary tl-button--md" href="/account">
              Your account
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
