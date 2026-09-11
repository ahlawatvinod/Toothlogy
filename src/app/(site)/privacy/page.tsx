/**
 * TL-PAGE-PRIVACY-001 — /privacy
 *
 * Describes what the system ACTUALLY does today, derived from the schema and
 * the code: which tables exist, what is hashed, what is audited, what is
 * retained.
 *
 * A boilerplate policy describing data flows the product does not have is worse
 * than none — it is a document that will be relied on and is wrong. This one is
 * explicitly marked as not yet legally reviewed, which is the honest status.
 */

import type { Metadata } from 'next';
import { Alert } from '@/design-system';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Toothlogy collects, why, and what we do with it.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Privacy</h1>
        <p className="tl-page__lead">
          What Toothlogy collects today, why, and what happens to it.
        </p>
      </header>

      <Alert tone="warning" title="Not yet legally reviewed">
        This describes the system as it is actually built, accurately. It is not a substitute for
        a reviewed privacy notice, which is required before Toothlogy processes real patient data
        and is part of the compliance work in a later phase.
      </Alert>

      <div className="tl-prose">
        <h2>What we store</h2>
        <p>
          Toothlogy stores account information — your name, and an email address or phone number —
          along with your language, country and timezone preferences, the organizations you belong
          to, and the sessions you are signed in with.
        </p>
        <p>What else is stored depends on what you use:</p>
        <ul>
          <li>
            <strong>Appointments</strong> you book, and the requests and messages you exchange with a
            practice you have an appointment with.
          </li>
          <li>
            <strong>Your dental record and prescriptions.</strong> The record is yours: a practice sees
            it only while you allow it, every time it looks is recorded, and you can see who looked and
            withdraw access at any time.
          </li>
          <li>
            <strong>Reviews, community posts, help requests, admission enquiries and job
            applications</strong> you submit, with the résumé you upload for an application.
          </li>
          <li>
            <strong>Marketplace orders</strong>: what you ordered and the delivery name, phone and
            address you gave, which the seller sees in order to deliver.
          </li>
          <li>
            For organizations: listings, catalogues, equipment and maintenance contracts, leads and the
            lead wallet&apos;s ledger.
          </li>
        </ul>
        <p>
          No card, UPI or bank details are stored: no payment provider is connected. When a seller
          records a payment it received for an order, only the amount, method, date and the seller&apos;s
          own reference are kept.
        </p>

        <h2>Passwords and tokens</h2>
        <p>
          Passwords are hashed with scrypt, a memory-hard algorithm, and are never stored,
          transmitted or logged in a form that can be reversed. Session tokens, password-reset
          links, verification links and invitation links are stored only as SHA-256 hashes, so a
          database disclosure does not hand anyone a working credential.
        </p>

        <h2>What we log</h2>
        <p>
          Application logs record what happened and when, with a request identifier so a problem
          you report can be traced. Passwords, tokens, secrets and clinical fields are redacted
          before a log line is written — redaction happens centrally, so it cannot be forgotten
          at an individual call site.
        </p>
        <p>
          Separately, an append-only audit trail records who did what, to what, when and with
          what outcome. It cannot be edited or deleted by any part of the platform.
        </p>

        <h2>Sign-in attempts</h2>
        <p>
          We record sign-in attempts, successful and failed, with the identifier used and the
          originating IP address. This is what makes credential-stuffing attacks detectable and
          lets an account under attack be protected.
        </p>

        <h2>Third parties</h2>
        <p>
          <strong>No third-party providers are connected.</strong> No email, SMS, WhatsApp, push,
          payments, maps, analytics or AI provider is configured, so no data leaves Toothlogy.
          When providers are connected, the analytics layer already strips identifying and
          clinical fields before anything is dispatched.
        </p>

        <h2>Deleting your account</h2>
        <p>
          You can request deletion from your account settings. Deletion is scheduled 30 days
          ahead and can be cancelled in that window — which protects you if your account was
          compromised or you acted in haste. Your sessions are ended immediately and the account
          is deactivated at once.
        </p>
        <p>
          Audit records of actions taken on the account survive deletion. That is deliberate: an
          audit trail that can be erased by the person it describes is not an audit trail.
        </p>

        <h2>Consent</h2>
        <p>
          Consent is recorded per purpose — marketing by email, SMS or WhatsApp, clinical data
          sharing, AI training, analytics — with the policy version you agreed to and when. Each
          can be withdrawn independently. Withdrawing consent records the withdrawal rather than
          deleting the original grant, because proving what was agreed at the time is the point
          of recording it.
        </p>
        <p>
          Messages about something you asked us to do — a booking confirmation, a security alert
          — are sent regardless of marketing preferences. Marketing is never sent without
          consent.
        </p>
      </div>
    </div>
  );
}
