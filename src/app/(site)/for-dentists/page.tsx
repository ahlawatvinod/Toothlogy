/**
 * TL-PAGE-FOR-DENTISTS-001 — /for-dentists
 *
 * What Toothlogy does for a dentist, as it is built today — each point links
 * to the place it happens. Lead pricing comes from the configured rule, never
 * from this page's text.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/design-system';
import { LeadPricingNote } from '@/components/shell/lead-pricing-note';

export const metadata: Metadata = {
  title: 'For dentists',
  description: 'A verified profile patients can trust, bookings and reminders, leads you pay for only when they are real, patient records with consent, reviews tied to real visits.',
  alternates: { canonical: '/for-dentists' },
};
export const dynamic = 'force-dynamic';

const SECTIONS: ReadonlyArray<{ title: string; body: string; link?: { href: string; label: string } }> = [
  {
    title: 'Be found — once we have checked you',
    body: 'Your public profile lists your qualifications, specialties, languages, fee and the practices you work at. It appears in patient search only after Toothlogy staff check your dental registration; an unchecked profile is never shown as part of the directory.',
    link: { href: '/find', label: 'See patient search' },
  },
  {
    title: 'Take bookings without the phone ringing',
    body: 'Set your hours per practice; patients book instantly or send a request you confirm. Reminders go out the day before, on the day and shortly before; cancellations open your waitlist. Video consultations get a link when a video provider is connected.',
  },
  {
    title: 'Pay for leads only when they are real',
    body: '',
  },
  {
    title: 'Your patients’ records — with their consent',
    body: 'When a patient shares their dental record with your practice, you read it, add notes, X-rays and reports, and issue prescriptions with a QR code a pharmacist can check. They can see every time you look, and withdraw access at any time.',
  },
  {
    title: 'Reviews from real visits, messages that stay on record',
    body: 'Only a patient whose appointment took place can review it; you reply in public and can ask a moderator to look at a review. Patients with an appointment can message your practice.',
  },
  {
    title: 'More than the chair',
    body: 'Write plain-language articles for patients (reviewed by another dentist before they appear), run or join district dental camps, keep an academic profile, and find or post jobs.',
    link: { href: '/knowledge', label: 'Dental knowledge' },
  },
];

export default function ForDentistsPage() {
  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <header className="tl-page__header">
        <h1>For dentists</h1>
        <p className="tl-page__lead">A verified profile patients can trust, and the tools to run your day — built so that nothing unchecked, unconsented or unasked-for reaches a patient.</p>
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <Link className="tl-button tl-button--primary" href="/register?role=dentist">
            <span>Create a dentist account</span>
          </Link>
          <Link className="tl-button tl-button--secondary" href="/login">
            <span>Sign in</span>
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
        Running a clinic or hospital? See <Link href="/for-clinics">for clinics</Link>.
      </p>
    </div>
  );
}
