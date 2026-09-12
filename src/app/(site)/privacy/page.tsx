/**
 * TL-PAGE-PRIVACY-POLICY-001 — /privacy
 *
 * The privacy policy as issued by Toothlogy. The policy text is the
 * organization's own; it is rendered here as written.
 *
 * The closing section is ours and is factual rather than legal: which of the
 * processors the policy contemplates are actually connected today. Constitution
 * P9 — a policy may describe what may happen, but this page must never leave a
 * reader believing email, SMS, WhatsApp, push, payment or analytics providers
 * are in use while they are not. Update it whenever a provider is connected.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Toothlogy collects, uses, stores, discloses and protects personal information, including health-related information, across its website, applications and services.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

const LAST_UPDATED = 'September 12, 2026';

export default function PrivacyPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '48rem' }}>
      <header className="tl-page__header">
        <h1>Privacy Policy</h1>
        <p className="tl-muted">Last updated: {LAST_UPDATED}</p>
        <p className="tl-page__lead">
          Toothlogy (“Toothlogy”, “we”, “our”, or “us”) respects your privacy and is committed to
          protecting your personal information. This Privacy Policy explains how we collect, use,
          store, disclose and protect information when you access or use the Toothlogy website,
          mobile applications, services and related platforms (collectively, the “Platform”). By
          using Toothlogy, you acknowledge that you have read and understood this Privacy Policy.
        </p>
      </header>

      <section aria-labelledby="collect-heading" className="tl-prose">
        <h2 id="collect-heading">1. Information we collect</h2>
        <p>
          Depending on how you use Toothlogy, we may collect information such as your name, mobile
          number, email address, date of birth or age, gender where voluntarily provided, address,
          city, state, country, profile information, login credentials, appointment details, dentist
          or clinic preferences, and communication preferences.
        </p>
        <p>
          If you use services involving dental care, you may voluntarily provide health-related
          information such as dental concerns, symptoms, treatment requirements, appointment
          information, dental history, reports, prescriptions, photographs, X-rays, scans, or other
          information necessary for a dental service. Such information may be treated as sensitive or
          health-related information under applicable laws, and we aim to process it only for
          legitimate purposes and with appropriate safeguards.
        </p>
        <p>
          We may also automatically collect certain technical and usage information, including IP
          address, browser type, device information, operating system, approximate location, pages
          viewed, search activity, referring URLs, access times, and interactions with the Platform.
          We may use cookies and similar technologies to maintain sessions, remember preferences,
          understand usage, improve security, and improve our services.
        </p>
      </section>

      <section aria-labelledby="use-heading" className="tl-prose">
        <h2 id="use-heading">2. How we use your information</h2>
        <p>
          We may use collected information to create and manage your account, provide and personalise
          Toothlogy services, facilitate dentist and clinic discovery, manage appointments and
          requests, communicate with you, provide customer support, process transactions where
          applicable, improve our Platform, conduct analytics, prevent fraud and misuse, maintain
          security, and comply with applicable legal obligations.
        </p>
        <p>
          Health or dental information may be used only where reasonably necessary for the service
          you request, such as facilitating communication with a dentist or clinic, supporting
          appointment or treatment-related services, maintaining information you choose to store, or
          providing relevant functionality. Toothlogy does not intend to replace professional medical
          or dental advice, diagnosis or treatment.
        </p>
        <p>
          Where legally required, we will seek appropriate consent before processing information for
          particular purposes. You may have choices regarding certain communications and uses of your
          information, subject to legal and operational requirements.
        </p>
      </section>

      <section aria-labelledby="providers-heading" className="tl-prose">
        <h2 id="providers-heading">3. Dentist, clinic and service provider information</h2>
        <p>
          Toothlogy may provide profiles or information relating to dentists, dental clinics,
          hospitals, laboratories, dental professionals, and other healthcare or service providers.
          Information displayed on professional profiles may include names, qualifications,
          specialties, clinic details, services, professional photographs, location, contact
          information, availability, reviews, ratings, and other information supplied or authorised by
          the relevant professional or organisation.
        </p>
        <p>
          Toothlogy may share information you provide with a dentist, clinic or other service provider
          when necessary to fulfil a request you initiate, such as an appointment, consultation
          request, enquiry or other healthcare service.
        </p>
      </section>

      <section aria-labelledby="sharing-heading" className="tl-prose">
        <h2 id="sharing-heading">4. Information sharing and disclosure</h2>
        <p>We do not sell your personal information merely because you use Toothlogy.</p>
        <p>
          We may share information when necessary with dentists, clinics, healthcare professionals,
          service providers, technology providers, payment processors, communication providers,
          analytics providers, hosting providers, customer-support providers, and other trusted
          partners who help us operate the Platform.
        </p>
        <p>
          We may also disclose information when required by applicable law, regulation, court order,
          governmental authority or legal process, or where reasonably necessary to protect the
          rights, safety, security and property of Toothlogy, our users, healthcare professionals or
          the public.
        </p>
        <p>
          If Toothlogy is involved in a merger, acquisition, restructuring, financing, sale of assets
          or similar business transaction, information may be transferred as part of that transaction,
          subject to applicable legal requirements and appropriate safeguards.
        </p>
      </section>

      <section aria-labelledby="cookies-heading" className="tl-prose">
        <h2 id="cookies-heading">5. Cookies and similar technologies</h2>
        <p>
          Toothlogy may use cookies, pixels, local storage, SDKs and similar technologies to provide
          essential functionality, remember preferences, analyse Platform usage, improve performance,
          maintain security, and understand how users interact with our services.
        </p>
        <p>
          You may be able to control cookies through your browser or device settings. Disabling
          certain cookies may affect the availability or functionality of some features.
        </p>
      </section>

      <section aria-labelledby="communications-heading" className="tl-prose">
        <h2 id="communications-heading">6. Communications</h2>
        <p>
          We may contact you through email, SMS, phone calls, push notifications, WhatsApp or other
          permitted communication channels regarding account activity, appointments, service requests,
          security notices, customer support, important Platform updates, and other transactions or
          services you initiate.
        </p>
        <p>
          Where required by law, promotional communications will be subject to appropriate consent and
          opt-out mechanisms.
        </p>
      </section>

      <section aria-labelledby="security-heading" className="tl-prose">
        <h2 id="security-heading">7. Data security</h2>
        <p>
          We use reasonable technical, administrative and organisational safeguards designed to
          protect personal information against unauthorised access, alteration, disclosure, loss,
          misuse or destruction.
        </p>
        <p>
          However, no website, application, electronic transmission or storage system can be
          guaranteed to be completely secure. You should use strong passwords, protect your account
          credentials, and notify us promptly if you believe your account or information has been
          compromised.
        </p>
      </section>

      <section aria-labelledby="retention-heading" className="tl-prose">
        <h2 id="retention-heading">8. Data retention</h2>
        <p>
          We retain personal information only for as long as reasonably necessary to provide our
          services, maintain business and transaction records, fulfil legitimate operational purposes,
          resolve disputes, enforce agreements, comply with legal obligations, and protect our rights.
        </p>
        <p>
          Retention periods may vary depending on the type of information and the purpose for which it
          was collected. When information is no longer required, we may securely delete, anonymise or
          de-identify it, subject to applicable legal and regulatory requirements.
        </p>
      </section>

      <section aria-labelledby="children-heading" className="tl-prose">
        <h2 id="children-heading">9. Children’s privacy</h2>
        <p>
          Toothlogy is not intended to knowingly collect personal information directly from children
          in circumstances where parental or guardian consent is legally required without obtaining
          such consent.
        </p>
        <p>
          Where services are used for a minor, a parent, legal guardian or other legally authorised
          person may be required to provide information or consent on the minor’s behalf.
        </p>
        <p>
          If you believe that a child has provided personal information to Toothlogy without
          appropriate authorisation, please contact us so that we can review and take appropriate
          action.
        </p>
      </section>

      <section aria-labelledby="third-party-heading" className="tl-prose">
        <h2 id="third-party-heading">10. Third-party services and links</h2>
        <p>
          The Platform may contain links to third-party websites, applications, payment services,
          maps, communication services, social-media platforms, healthcare services or other external
          services.
        </p>
        <p>
          Third-party services operate under their own privacy policies and terms. Toothlogy is not
          responsible for the privacy practices, security, content or policies of third-party services
          that we do not control.
        </p>
      </section>

      <section aria-labelledby="international-heading" className="tl-prose">
        <h2 id="international-heading">11. International data processing</h2>
        <p>
          Depending on our technology infrastructure and service providers, your information may be
          processed or stored in India or other countries. Where personal information is transferred
          across borders, we will seek to comply with applicable data-protection and privacy
          requirements and use reasonable safeguards appropriate to the circumstances.
        </p>
      </section>

      <section aria-labelledby="rights-heading" className="tl-prose">
        <h2 id="rights-heading">12. Your privacy rights</h2>
        <p>
          Subject to applicable law, you may have rights regarding your personal information,
          including the right to request access to information we hold about you, request correction
          of inaccurate information, request deletion where legally permissible, withdraw consent
          where processing is based on consent, object to or restrict certain processing, and exercise
          applicable rights concerning communications and marketing.
        </p>
        <p>
          Requests may be subject to verification and applicable legal limitations. Certain
          information may need to be retained where required by law or where there is a legitimate
          reason to do so.
        </p>
      </section>

      <section aria-labelledby="accuracy-heading" className="tl-prose">
        <h2 id="accuracy-heading">13. Data accuracy</h2>
        <p>
          You are responsible for providing accurate and updated information when using Toothlogy. You
          should notify us or update your account information when relevant information changes.
        </p>
        <p>
          Toothlogy does not independently guarantee the accuracy, completeness or current status of
          information submitted by users, dentists, clinics or other third parties. Professional
          qualifications, services, availability, prices and other provider information should be
          verified where appropriate.
        </p>
      </section>

      <section aria-labelledby="changes-heading" className="tl-prose">
        <h2 id="changes-heading">14. Changes to this Privacy Policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect changes in our services,
          technology, business practices or applicable laws.
        </p>
        <p>
          When we make material changes, we may provide an appropriate notice through the Platform or
          other communication channels. The updated Privacy Policy will become effective on the date
          stated at the beginning of the revised policy.
        </p>
      </section>

      <section aria-labelledby="contact-heading" className="tl-prose">
        <h2 id="contact-heading">15. Contact us</h2>
        <p>
          If you have questions, concerns, complaints, privacy requests or requests relating to your
          personal information, please contact Toothlogy at{' '}
          <a href="mailto:info@toothlogy.com">info@toothlogy.com</a>.
        </p>
        <p>
          Please include sufficient information in your request for us to understand and appropriately
          respond to your concern. We may request reasonable information to verify your identity
          before processing certain privacy requests.
        </p>
      </section>

      <section aria-labelledby="healthcare-heading" className="tl-prose">
        <h2 id="healthcare-heading">16. Important healthcare disclaimer</h2>
        <p>
          Toothlogy is a technology platform intended to facilitate access to dental information,
          professionals, clinics and related services. Information available through Toothlogy should
          not be considered a substitute for professional dental examination, diagnosis, treatment or
          emergency medical care.
        </p>
        <p>
          Patients should consult an appropriately qualified dental professional for diagnosis and
          treatment decisions. In an emergency or serious medical situation, seek appropriate
          emergency medical assistance immediately.
        </p>
      </section>

      <section aria-labelledby="today-heading" className="tl-prose">
        <h2 id="today-heading">What this means on Toothlogy today</h2>
        <p>
          The policy above describes what may happen as Toothlogy grows. This section says what is
          actually connected right now, so nothing above is read as a claim about today:
        </p>
        <ul>
          <li>
            <strong>Messages reach you in the app.</strong> No email, SMS, WhatsApp or push provider
            is connected, so Toothlogy sends nothing outside the Platform. Where a message cannot be
            sent, the screen says so instead of pretending it was.
          </li>
          <li>
            <strong>No third-party analytics or advertising trackers.</strong> Toothlogy counts page
            and profile views itself. A signed-in visitor is told apart only with their analytics
            consent, and searches record their shape, never the words typed.
          </li>
          <li>
            <strong>No payment provider.</strong> Toothlogy takes no card or UPI payment; in the
            marketplace, buyers pay sellers directly.
          </li>
          <li>
            <strong>Cookies are what the session needs.</strong> Sign-in and security cookies, and the
            preferences your browser stores for themes and text size.
          </li>
          <li>
            <strong>Your dental record is yours.</strong> A clinic sees it only under a grant you
            give, which is time-limited, revocable and audited, and you can see every time someone
            looks. You can <Link href="/account/privacy">export your data</Link> at any time.
          </li>
        </ul>
        <p className="tl-muted">
          See also the <Link href="/terms">Terms &amp; Conditions</Link> and{' '}
          <Link href="/about">About Toothlogy</Link>.
        </p>
      </section>

      <p className="tl-muted">© Toothlogy. All rights reserved.</p>
    </div>
  );
}
