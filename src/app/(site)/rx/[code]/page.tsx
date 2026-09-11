/**
 * TL-PAGE-RX-VERIFY-001 — /rx/:code
 *
 * What a pharmacist sees on scanning a prescription's QR code: whether it is
 * genuine and still valid, when and by whom it was issued, the patient's first
 * name and initial, and the medicines. Nothing else about the patient. Not
 * indexed; unknown codes are a plain not-found.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { verifyPrescription } from '@/platform/records/service';
import { Alert, Badge, Card, CardBody } from '@/design-system';

export const metadata: Metadata = { title: 'Prescription check', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PrescriptionCheckPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const rx = await verifyPrescription(code.toUpperCase());
  if (!rx) notFound();
  const date = (d: Date) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(d);

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '44rem' }}>
      <header className="tl-page__header">
        <h1>Prescription check</h1>
      </header>
      {rx.status === 'ISSUED' ? (
        <Alert tone="success">Genuine — issued on Toothlogy on {date(rx.issuedAt)} and not cancelled.</Alert>
      ) : (
        <Alert tone="danger">Cancelled by the practice{rx.cancelledAt ? ` on ${date(rx.cancelledAt)}` : ''}. Do not dispense.</Alert>
      )}
      <Card label="Prescription details">
        <CardBody>
          <dl className="tl-kv">
            <div>
              <dt>Practice</dt>
              <dd>{rx.practice}</dd>
            </div>
            <div>
              <dt>Prescriber</dt>
              <dd>
                {rx.prescriber} {rx.verifiedDentist ? <Badge tone="success">verified dentist</Badge> : <Badge tone="warning">verification lapsed</Badge>}
              </dd>
            </div>
            <div>
              <dt>Patient</dt>
              <dd>{rx.patient}</dd>
            </div>
            <div>
              <dt>Medicines</dt>
              <dd>
                <ul className="tl-list" aria-label="Medicines">
                  {rx.items.map((item, i) => (
                    <li key={i}>
                      <strong>
                        {item.medicine}
                        {item.strength ? ` ${item.strength}` : ''}
                      </strong>{' '}
                      — {item.dose}, {item.frequency}, {item.duration}
                      {item.instructions ? ` (${item.instructions})` : ''}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
      <p className="tl-muted">This shows what Toothlogy holds for this code. Your own professional checks still apply.</p>
    </div>
  );
}
