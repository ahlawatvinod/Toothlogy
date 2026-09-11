/**
 * TL-PAGE-TERMS-001 — /terms
 *
 * Registration requires accepting these, so the page must exist and must say
 * something true. Marked clearly as not yet legally reviewed rather than
 * dressed up as a finished contract.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/design-system';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms on which Toothlogy is provided.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Terms of use</h1>
      </header>

      <Alert tone="warning" title="Not yet legally reviewed">
        Toothlogy is under construction and is not open for real patient care. These terms
        describe how the platform is intended to work; a reviewed agreement is required before
        the service handles real bookings or clinical data.
      </Alert>

      <div className="tl-prose">
        <h2>What Toothlogy is</h2>
        <p>
          Toothlogy is a platform that helps patients find dental professionals, and helps
          practices, colleges and suppliers be found. It is not a healthcare provider. Care is
          provided by the dentists and clinics you find through it, and your relationship for
          treatment is with them.
        </p>

        <h2>Not medical advice</h2>
        <p>
          Nothing on Toothlogy is a diagnosis, a treatment plan, or a substitute for
          professional dental advice. If you have severe pain, swelling, bleeding that will not
          stop, difficulty breathing or swallowing, or an injury to the face or jaw, seek
          emergency care immediately rather than using this site.
        </p>

        <h2>Your account</h2>
        <p>
          You are responsible for keeping your password confidential and for activity under your
          account. Tell us promptly if you believe someone else has access. You can review the
          devices signed in to your account, and end any of them, from your security settings.
        </p>
        <p>
          Accounts are for the person or organization who created them. Do not create an account
          claiming professional credentials you do not hold — professional profiles are subject
          to verification, and misrepresentation is grounds for removal.
        </p>

        <h2>Content you provide</h2>
        <p>
          You keep ownership of what you upload. You give us permission to store and display it
          as needed to run the service. Do not upload anything you do not have the right to
          share, and do not upload another person&rsquo;s health information without their
          consent.
        </p>

        <h2>Reviews</h2>
        <p>
          Reviews must describe genuine experience. A practice being reviewed may respond, but
          cannot edit or delete what was written about it. We remove reviews that are fraudulent,
          or that disclose another person&rsquo;s private information.
        </p>

        <h2>Availability</h2>
        <p>
          Toothlogy is provided as it is. Most of the platform is still being built, and features
          described as planned may change or may not ship. We tell you plainly which features
          work today rather than implying that unfinished ones do.
        </p>

        <h2>Ending your use</h2>
        <p>
          You can request account deletion at any time from your settings. We may suspend an
          account that is being used to defraud patients, misrepresent credentials, or abuse the
          platform.
        </p>

        <h2>Privacy</h2>
        <p>
          How we handle your data is described in our <Link href="/privacy">privacy notice</Link>.
        </p>
      </div>
    </div>
  );
}
