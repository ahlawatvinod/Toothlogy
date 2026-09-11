/**
 * What a patient can do with one appointment. Only the actions the server
 * page allowed are shown; the API checks every one again.
 */

'use client';

import type { Alternatives } from '@/platform/appointments/alternatives';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { SlotPicker, type PickedSlot } from '@/components/booking/slot-picker';

export function PatientActions({
  appointmentId,
  practiceId,
  serviceOfferingId,
  type,
  timezone,
  startsAt,
  canCheckIn,
  canAccept,
  canCancel,
  canReschedule,
  rebookHref,
  rebookLabel = 'Book again',
  alternatives = null,
}: {
  appointmentId: string;
  practiceId: string;
  serviceOfferingId: string | null;
  type: 'CLINIC' | 'VIDEO' | 'HOME_VISIT';
  timezone: string;
  startsAt: string;
  canCheckIn: boolean;
  canAccept: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  rebookHref: string | null;
  rebookLabel?: string;
  /** Other ways to rebook: bookable dentists at the same clinic, or a search that keeps the treatment and place. */
  alternatives?: Alternatives | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [moving, setMoving] = useState(false);
  const [slot, setSlot] = useState<PickedSlot | null>(null);

  async function act(action: 'CHECK_IN' | 'ACCEPT' | 'CANCEL', success: string) {
    setBusy(action);
    setNotice(null);
    const result = await api.post<{ status: string }>(
      `/api/v1/appointments/${appointmentId}/transitions`,
      { action, ...(action === 'CANCEL' && reason.trim() ? { reason: reason.trim() } : {}) },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: success });
    setCancelling(false);
    router.refresh();
  }

  async function reschedule() {
    if (!slot) return;
    setBusy('RESCHEDULE');
    setNotice(null);
    const result = await api.post<{ status: string }>(`/api/v1/appointments/${appointmentId}/reschedule`, { startsAt: slot.startsAt });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({
      tone: 'success',
      text: result.data.status === 'CONFIRMED' ? 'Moved and confirmed.' : 'Moved. The clinic will confirm the new time.',
    });
    setMoving(false);
    router.refresh();
  }

  const nothing = !canCheckIn && !canAccept && !canCancel && !canReschedule && !rebookHref;
  if (nothing) return notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null;

  return (
    <Card label="Actions">
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {canAccept ? (
              <Button loading={busy === 'ACCEPT'} onClick={() => act('ACCEPT', 'Confirmed. See you then.')}>
                Confirm this time
              </Button>
            ) : null}
            {canCheckIn ? (
              <Button loading={busy === 'CHECK_IN'} onClick={() => act('CHECK_IN', 'Checked in. The clinic can see you have arrived.')}>
                I have arrived — check in
              </Button>
            ) : null}
            {canReschedule ? (
              <Button variant="secondary" onClick={() => setMoving((v) => !v)} aria-expanded={moving}>
                Change time
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="ghost" onClick={() => setCancelling((v) => !v)} aria-expanded={cancelling}>
                Cancel appointment
              </Button>
            ) : null}
            {rebookHref ? (
              <Link className="tl-button tl-button--secondary tl-button--md" href={rebookHref}>
                <span>{rebookLabel}</span>
              </Link>
            ) : null}
          </div>
          {rebookHref && alternatives ? (
            <div className="tl-stack">
              {alternatives.dentists.length > 0 ? (
                <>
                  <p className="tl-muted" style={{ margin: 0 }}>
                    Other dentists at <Link href={alternatives.clinicHref}>{alternatives.clinicName}</Link> with free times:
                  </p>
                  <ul className="tl-list">
                    {alternatives.dentists.map((d) => (
                      <li key={d.practiceId}>
                        <Link href={d.href}>{d.name}</Link> <span className="tl-list__meta">next free {d.next}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="tl-muted" style={{ margin: 0 }}>
                Or <Link href={alternatives.findDentistHref}>find a different dentist</Link> or <Link href={alternatives.findClinicHref}>a different clinic</Link>{' '}
                near {alternatives.clinicName} for the same treatment. Times are always checked again when you book.
              </p>
            </div>
          ) : null}

          {cancelling ? (
            <div className="tl-stack">
              <Field label="Reason" hint="Optional. Helps the clinic offer the time to someone else.">
                {(props) => <Input {...props} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
              </Field>
              <div>
                <Button variant="danger" loading={busy === 'CANCEL'} onClick={() => act('CANCEL', 'Cancelled. The clinic has been told.')}>
                  Confirm cancellation
                </Button>
              </div>
            </div>
          ) : null}

          {moving ? (
            <div className="tl-stack">
              <SlotPicker
                practiceId={practiceId}
                serviceOfferingId={serviceOfferingId}
                type={type}
                timezone={timezone}
                selected={slot?.startsAt ?? null}
                excludeStartsAt={startsAt}
                onSelect={setSlot}
              />
              <div>
                <Button disabled={!slot} loading={busy === 'RESCHEDULE'} onClick={reschedule}>
                  Move to {slot ? `${slot.localDate} ${slot.localTime}` : 'the chosen time'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
