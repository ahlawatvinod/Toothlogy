/**
 * Booking settings for each place a dentist practises.
 *
 * Settings belong to the practice, not the dentist: the same dentist can take
 * instant bookings at their own clinic and requests only at a hospital, with
 * different fees. The clinic can change them too (to pause a dentist on
 * leave), and both are audited.
 *
 * These settings drive the availability engine and the booking flow directly:
 * slot length, buffer, notice and window shape the slots patients see, and
 * instant confirmation decides whether a booking is confirmed or requested.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export interface PracticeSettings {
  consultationFeeMinor: number | null;
  autoConfirm: boolean;
  acceptsVideo: boolean;
  acceptsHomeVisit: boolean;
  acceptsEmergency: boolean;
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bookingPaused: boolean;
}

export interface PracticeRow {
  readonly id: string;
  readonly isConfirmed: boolean;
  readonly locationName: string;
  readonly organizationName: string;
  readonly currency: string;
  readonly homeVisitAvailable: boolean;
  readonly settings: PracticeSettings;
}

const SLOT_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
const BUFFER_OPTIONS = [0, 5, 10, 15, 30];
const NOTICE_OPTIONS = [
  { minutes: 0, label: 'No minimum' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 720, label: '12 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 2880, label: '2 days' },
];
const ADVANCE_OPTIONS = [7, 14, 30, 60, 90, 180];

function fractionDigits(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

function PracticeForm({ practice }: { practice: PracticeRow }) {
  const router = useRouter();
  const digits = fractionDigits(practice.currency);
  const [s, setS] = useState<PracticeSettings>(practice.settings);
  const [fee, setFee] = useState(
    practice.settings.consultationFeeMinor !== null ? (practice.settings.consultationFeeMinor / 10 ** digits).toString() : '',
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const set = <K extends keyof PracticeSettings>(key: K, value: PracticeSettings[K]) => setS((prev) => ({ ...prev, [key]: value }));

  async function save() {
    const cleaned = fee.replace(/,/g, '').trim();
    const pattern = digits > 0 ? new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`) : /^\d+$/;
    if (cleaned && !pattern.test(cleaned)) return setNotice({ tone: 'danger', text: `Enter the fee in ${practice.currency}, e.g. 500.` });
    setSaving(true);
    setNotice(null);
    const result = await api.patch(`/api/v1/practices/${practice.id}/settings`, {
      ...s,
      consultationFeeMinor: cleaned ? Math.round(Number(cleaned) * 10 ** digits) : null,
    });
    setSaving(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Saved.' });
    router.refresh();
  }

  const select = (label: string, value: number, options: ReadonlyArray<{ value: number; label: string }>, onChange: (v: number) => void) => (
    <Field label={label}>
      {(props) => (
        <select {...props} className="tl-input" value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  return (
    <li className="tl-stack">
      <div className="tl-card__title-row">
        <strong>
          {practice.locationName} · {practice.organizationName}
        </strong>
        {practice.isConfirmed ? <Badge tone="success">Confirmed by the clinic</Badge> : <Badge tone="warning">Awaiting the clinic’s confirmation</Badge>}
        {s.bookingPaused ? <Badge tone="neutral">Bookings paused</Badge> : null}
      </div>

      {notice ? (
        <Alert tone={notice.tone} title={notice.tone === 'success' ? 'Done' : 'Not saved'}>
          {notice.text}
        </Alert>
      ) : null}

      <div className="tl-form-grid">
        <Field label={`Consultation fee here (${practice.currency})`} hint="Leave empty to use your profile fee.">
          {(props) => <Input {...props} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />}
        </Field>
        {select('Appointment length', s.slotMinutes, SLOT_OPTIONS.map((m) => ({ value: m, label: `${m} minutes` })), (v) => set('slotMinutes', v))}
        {select('Gap between appointments', s.bufferMinutes, BUFFER_OPTIONS.map((m) => ({ value: m, label: m === 0 ? 'None' : `${m} minutes` })), (v) => set('bufferMinutes', v))}
        {select('Minimum notice', s.minNoticeMinutes, NOTICE_OPTIONS.map((o) => ({ value: o.minutes, label: o.label })), (v) => set('minNoticeMinutes', v))}
        {select('Book up to', s.maxAdvanceDays, ADVANCE_OPTIONS.map((d) => ({ value: d, label: `${d} days ahead` })), (v) => set('maxAdvanceDays', v))}
      </div>

      <fieldset className="tl-fieldset">
        <legend className="tl-fieldset__legend">How patients can book</legend>
        <label className="tl-checkbox">
          <input type="checkbox" checked={s.autoConfirm} onChange={(e) => set('autoConfirm', e.target.checked)} />
          <span>Confirm bookings instantly (otherwise each request waits for you or the clinic to accept)</span>
        </label>
        <label className="tl-checkbox">
          <input type="checkbox" checked={s.acceptsVideo} onChange={(e) => set('acceptsVideo', e.target.checked)} />
          <span>Video consultations</span>
        </label>
        <label className="tl-checkbox">
          <input
            type="checkbox"
            checked={s.acceptsHomeVisit}
            disabled={!practice.homeVisitAvailable && !s.acceptsHomeVisit}
            onChange={(e) => set('acceptsHomeVisit', e.target.checked)}
          />
          <span>Home visits{practice.homeVisitAvailable ? '' : ' — the clinic has not set a home-visit area for this branch'}</span>
        </label>
        <label className="tl-checkbox">
          <input type="checkbox" checked={s.acceptsEmergency} onChange={(e) => set('acceptsEmergency', e.target.checked)} />
          <span>Same-day emergency appointments</span>
        </label>
        <label className="tl-checkbox">
          <input type="checkbox" checked={s.bookingPaused} onChange={(e) => set('bookingPaused', e.target.checked)} />
          <span>Pause new bookings here (existing appointments are unaffected)</span>
        </label>
      </fieldset>

      <div>
        <Button onClick={save} loading={saving} variant="secondary">
          Save settings for {practice.locationName}
        </Button>
      </div>
    </li>
  );
}

export function PracticeSettingsCard({ practices }: { practices: readonly PracticeRow[] }) {
  return (
    <Card label="Where you practise">
      <CardHeader>
        <strong>Where you practise</strong>
      </CardHeader>
      <CardBody>
        <Alert tone="info" title="These settings take effect immediately">
          Patients book from the times these settings and your <Link href="/account/practice/availability">weekly sessions</Link>{' '}
          allow. Pause bookings here when you are away.
        </Alert>
        {practices.length === 0 ? (
          <p className="tl-muted">
            You have not added a practice location yet. Ask the clinic you work at to invite you, or add their branch
            once it is listed on Toothlogy.
          </p>
        ) : (
          <ul className="tl-list">
            {practices.map((p) => (
              <PracticeForm key={p.id} practice={p} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
