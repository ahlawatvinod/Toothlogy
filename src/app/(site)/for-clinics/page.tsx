/**
 * TL-PAGE-FOR-CLINICS-001 — /for-clinics
 *
 * What Toothlogy does for a clinic, hospital or dental business, as built
 * today, each point pointing at where it happens. Lead pricing comes from the
 * configured rule. Clinic pages link here ("Run this clinic?"), so claiming a
 * listing is explained first.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/design-system';
import { LeadPricingNote } from '@/components/shell/lead-pricing-note';

export const metadata: Metadata = {
  title: 'For clinics and hospitals',
  description: 'Run a dental practice on Toothlogy: branches, services and prices, staff roles, the appointment diary, leads, records shared with consent, reviews, and hiring.',
  alternates: { canonical: '/for-clinics' },
};
export const dynamic = 'force-dynamic';

const SECTIONS: ReadonlyArray<{ title: string; body: string; link?: { href: string; label: string } }> = [
  {
    title: 'Already listed? Claim your page',
    body: 'Toothlogy lists many clinics from public records before anyone from them joins. Open your clinic’s page and choose to claim it; after we check you run it, the page is yours to manage. Nothing you did not write is presented as coming from you.',
  },
  {
    title: 'Your practice, set up once',
    body: 'Create your organization, add branches with opening hours, holidays and chairs, and publish your services with your own prices from the shared treatment catalogue. Verification by Toothlogy staff adds the verified badge patients look for.',
    link: { href: '/account/organizations/new', label: 'Create your organization' },
  },
  {
    title: 'The right people see the right things',
    body: 'Invite your team as Administrators, Clinicians (who see the records patients share with you) or front-desk Staff (who run the diary and messages but never see clinical records). Dentists confirm the practices they work at.',
  },
  {
    title: 'A diary patients book into',
    body: 'Instant or request bookings per dentist, no double-booking of a chair, reminders, waitlists and a practice view of every appointment with the patient’s details.',
  },
  {
    title: 'Leads you pay for only when they are real',
    body: '',
  },
  {
    title: 'Be seen — clearly labelled',
    body: 'Prime placement puts your practice higher in local search for a daily budget, always marked as sponsored, never mixed into the ranking of verified results.',
  },
  {
    title: 'Records, reviews, messages and hiring',
    body: 'Read and add to dental records patients share with you; reply to reviews from real visits; answer patients’ messages; post jobs and internships and work the applications.',
    link: { href: '/careers', label: 'Toothlogy careers' },
  },
];

export default function ForClinicsPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>For clinics and hospitals</h1>
        <p className="tl-page__lead">Everything a dental practice runs on — branches, services, team, diary, leads, patients’ records and hiring — with patients’ consent and trust built in.</p>
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <Link className="tl-button tl-button--primary" href="/account/organizations/new">
            <span>Create your organization</span>
          </Link>
          <Link className="tl-button tl-button--secondary" href="/register">
            <span>Create an account</span>
          </Link>
        </div>
      </header>
      {SECTIONS.map((s) => (
        <Card key={s.title} label={s.title}>
          <CardHeader>
            <strong>{s.title}</strong>
          </CardHeader>
          <CardBody>
            {s.body ? <p style={{ marginTop: 0 }}>{s.body}</p> : <LeadPricingNote />}
            {s.link ? <Link href={s.link.href}>{s.link.label}</Link> : null}
          </CardBody>
        </Card>
      ))}
      <p className="tl-muted">
        A dentist on your own? See <Link href="/for-dentists">for dentists</Link>.
      </p>
    </div>
  );
}
