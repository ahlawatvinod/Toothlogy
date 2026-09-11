/**
 * The practice's actions on one appointment. The server page decides which
 * are offered from the state machine; the API re-checks each one. Declining,
 * cancelling and moving always carry a reason the patient will read.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { SlotPicker, type PickedSlot } from '@/components/booking/slot-picker';

export interface AllowedPracticeActions {
  readonly confirm: boolean;
  readonly reject: boolean;
  readonly checkIn: boolean;
  readonly start: boolean;
  readonly complete: boolean;
  readonly noShow: boolean;
  readonly cancel: boolean;
  readonly reschedule: boolean;
}

type Mode = 'reject' | 'cancel' | 'complete' | 'reschedule' | null;

export function PracticeActions({
  appointmentId,
  practiceId,
  serviceOfferingId,
  type,
  timezone,
  startsAt,
  allowed,
}: {
  appointmentId: string;
  practiceId: string;
  serviceOfferingId: string | null;
  type: 'CLINIC' | 'VIDEO' | 'HOME_VISIT';
  timezone: string;
  startsAt: string;
  allowed: AllowedPracticeActions;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [followUpDays, setFollowUpDays] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    const result = await api.post(`/api/v1/appointments/${appointmentId}/transitions`, { action, ...body }, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setMode(null);
    setReason('');
    router.refresh();
  }

  async function move() {
    if (!slot) return;
    if (reason.trim().length < 3) return setError('Tell the patient why the time is changing.');
    setBusy('RESCHEDULE');
    setError(null);
    const result = await api.post(`/api/v1/appointments/${appointmentId}/reschedule`, { startsAt: slot.startsAt, reason: reason.trim() });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setMode(null);
    router.refresh();
  }

  const any = Object.values(allowed).some(Boolean);
  if (!any) return null;

  return (
    <div className="tl-stack">
      {error ? (
        <Alert tone="danger" title="Not done">
          {error}
        </Alert>
      ) : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {allowed.confirm ? (
          <Button size="sm" loading={busy === 'CONFIRM'} onClick={() => act('CONFIRM')}>
            Confirm
          </Button>
        ) : null}
        {allowed.reject ? (
          <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'reject' ? null : 'reject')} aria-expanded={mode === 'reject'}>
            Decline
          </Button>
        ) : null}
        {allowed.checkIn ? (
          <Button size="sm" loading={busy === 'CHECK_IN'} onClick={() => act('CHECK_IN')}>
            Check in
          </Button>
        ) : null}
        {allowed.start ? (
          <Button size="sm" loading={busy === 'START'} onClick={() => act('START')}>
            Start
          </Button>
        ) : null}
        {allowed.complete ? (
          <Button size="sm" onClick={() => setMode(mode === 'complete' ? null : 'complete')} aria-expanded={mode === 'complete'}>
            Complete
          </Button>
        ) : null}
        {allowed.noShow ? (
          <Button size="sm" variant="secondary" loading={busy === 'NO_SHOW'} onClick={() => act('NO_SHOW')}>
            Mark missed
          </Button>
        ) : null}
        {allowed.reschedule ? (
          <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'reschedule' ? null : 'reschedule')} aria-expanded={mode === 'reschedule'}>
            Move
          </Button>
        ) : null}
        {allowed.cancel ? (
          <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'cancel' ? null : 'cancel')} aria-expanded={mode === 'cancel'}>
            Cancel
          </Button>
        ) : null}
      </div>

      {mode === 'reject' || mode === 'cancel' ? (
        <div className="tl-stack">
          <Field label="Reason for the patient" required>
            {(props) => <Input {...props} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div>
            <Button
              size="sm"
              variant="danger"
              loading={busy === (mode === 'reject' ? 'REJECT' : 'CANCEL')}
              onClick={() => (reason.trim().length < 3 ? setError('Give the patient a reason.') : act(mode === 'reject' ? 'REJECT' : 'CANCEL', { reason: reason.trim() }))}
            >
              {mode === 'reject' ? 'Decline request' : 'Cancel appointment'}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'complete' ? (
        <div className="tl-stack">
          <div className="tl-form-grid">
            <Field label="Follow-up in (days)" hint="Optional. The patient is reminded when it is due.">
              {(props) => <Input {...props} inputMode="numeric" value={followUpDays} onChange={(e) => setFollowUpDays(e.target.value)} />}
            </Field>
            <Field label="Follow-up for">
              {(props) => <Input {...props} value={followUpNote} maxLength={200} onChange={(e) => setFollowUpNote(e.target.value)} placeholder="e.g. Six-month check" />}
            </Field>
          </div>
          <div>
            <Button
              size="sm"
              loading={busy === 'COMPLETE'}
              onClick={() => {
                const days = followUpDays.trim() ? Number(followUpDays) : undefined;
                if (days !== undefined && (!Number.isInteger(days) || days < 1)) return setError('Follow-up days must be a whole number.');
                void act('COMPLETE', { ...(days ? { followUpInDays: days } : {}), ...(followUpNote.trim() ? { followUpNote: followUpNote.trim() } : {}) });
              }}
            >
              Mark completed
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'reschedule' ? (
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
          <Field label="Reason for the patient" required hint="The patient must accept the new time.">
            {(props) => <Input {...props} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" disabled={!slot} loading={busy === 'RESCHEDULE'} onClick={move}>
              Propose {slot ? `${slot.localDate} ${slot.localTime}` : 'the chosen time'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
