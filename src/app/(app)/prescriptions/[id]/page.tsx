/**
 * TL-PAGE-PRESCRIPTION-001 — /prescriptions/:id
 *
 * A prescription to print or save as PDF (the browser's own print, so nothing
 * leaves the device), with the QR code a pharmacist scans to check it on
 * Toothlogy. For the patient, or the issuing practice's members who may read
 * records; the practice's prescribers may cancel it. 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { toString as qrSvg } from 'qrcode';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getPrescription } from '@/platform/records/service';
import { absoluteUrl } from '@/platform/notifications';
import { isAppError } from '@/platform/kernel/errors';
import { Alert, Badge } from '@/design-system';
import { PrescriptionActions } from '@/components/records/prescription-actions';

export const metadata: Metadata = { title: 'Prescription', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .tl-rx, .tl-rx * { visibility: visible; }
  .tl-rx { position: absolute; inset: 0; padding: 12mm; }
  .tl-no-print { display: none !important; }
}
/* A flex/grid item defaults to min-width: auto, so the medicines table's
   min-content width would push the page sideways on a phone; the table
   scrolls inside its own wrapper instead. */
.tl-rx { min-width: 0; max-width: 100%; }
.tl-rx__scroll { overflow-x: auto; max-width: 100%; }
.tl-rx__table { width: 100%; border-collapse: collapse; }
.tl-rx__table th, .tl-rx__table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--tl-color-border, #d8dde3); vertical-align: top; }
.tl-rx__qr svg { width: 120px; height: 120px; }
`;

export default async function PrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/prescriptions/${id}`);
  const loaded = await getPrescription(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  const { prescription: rx, side, canCancel } = loaded;
  const checkUrl = absoluteUrl(`/rx/${rx.verifyCode}`);
  const qr = await qrSvg(checkUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d);
  const patient = rx.dependent ? `${rx.dependent.name} (${rx.dependent.relationship.toLowerCase()} of ${rx.patient.displayName ?? 'the account holder'})` : (rx.patient.displayName ?? 'Patient');

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '52rem' }}>
      <style>{PRINT_CSS}</style>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb tl-no-print">
        {side === 'PATIENT' ? <Link href="/account/records">Dental record</Link> : <Link href={`/account/organizations/${rx.organization.id}/patients/${rx.patientUserId}`}>Patient record</Link>}
      </nav>
      {rx.status === 'CANCELLED' ? (
        <Alert tone="danger">
          Cancelled by the practice{rx.cancelledAt ? ` on ${date(rx.cancelledAt)}` : ''}: {rx.cancelledReason}. Do not use it.
        </Alert>
      ) : null}
      <article className="tl-rx tl-stack" aria-label="Prescription">
        <header className="tl-card__title-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--tl-space-4)' }}>
          <div className="tl-stack">
            <h1 style={{ margin: 0 }}>{rx.organization.name}</h1>
            <span>
              {rx.prescriber.displayName ?? 'Dentist'} {rx.dentistProfile.isVerified ? <Badge tone="success">verified dentist on Toothlogy</Badge> : null}
            </span>
            <span className="tl-muted">Prescription · {date(rx.issuedAt)}</span>
          </div>
          {/* The SVG is generated here from our own URL by the qrcode library. */}
          <div className="tl-rx__qr" aria-label="QR code to check this prescription" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
        </header>
        <p style={{ margin: 0 }}>
          <strong>Patient:</strong> {patient}
          {rx.dependent?.birthYear ? `, born ${rx.dependent.birthYear}` : ''}
        </p>
        <div className="tl-rx__scroll">
          <table className="tl-rx__table">
            <thead>
              <tr>
                <th scope="col">Medicine</th>
                <th scope="col">Dose</th>
                <th scope="col">How often</th>
                <th scope="col">For how long</th>
                <th scope="col">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {rx.items.map((item, i) => (
                <tr key={i}>
                  <td>
                    <strong>{item.medicine}</strong>
                    {item.strength ? ` ${item.strength}` : ''}
                  </td>
                  <td>{item.dose}</td>
                  <td>{item.frequency}</td>
                  <td>{item.duration}</td>
                  <td>{item.instructions ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rx.advice ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            <strong>Advice:</strong> {rx.advice}
          </p>
        ) : null}
        <p className="tl-muted" style={{ margin: 0, wordBreak: 'break-all' }}>
          Pharmacist: scan the code, or open {checkUrl}, to check this prescription is genuine and not cancelled. Code {rx.verifyCode}.
        </p>
      </article>
      <PrescriptionActions prescriptionId={rx.id} canCancel={canCancel} />
    </div>
  );
}
