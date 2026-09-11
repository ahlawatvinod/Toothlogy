/**
 * One practice's weekly sessions and time off.
 *
 * Sessions reuse the branch opening-hours editor (split shifts; the gap is
 * the break). Saving no sessions means "the clinic's hours". Leave and blocks
 * are entered in the branch's timezone and converted to instants here with
 * the same arithmetic the server uses.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { fromRows, minutesToHHMM, toRows, DAY_NAMES, WEEK_ORDER, type Session } from '@/lib/opening-hours';
import { localDateTimeToIso } from '@/lib/zoned-time';
import { HoursEditor } from '@/app/(app)/account/organizations/[id]/hours-editor';

interface Availability {
  practiceId: string;
  timezone: string;
  locationName: string;
  clinicHours: Array<{ dayOfWeek: number; startMinutes: number; endMinutes: number }>;
  rules: Array<{ id: string; dayOfWeek: number; startMinutes: number; endMinutes: number; appointmentTypes: string[] }>;
  exceptions: Array<{ id: string; kind: string; startsAt: string; endsAt: string; reason: string | null }>;
}

export function AvailabilityEditor({ title, availability }: { title: string; availability: Availability }) {
  const router = useRouter();
  const tz = availability.timezone;
  const [week, setWeek] = useState<Session[][]>(
    fromRows(availability.rules.map((r) => ({ dayOfWeek: r.dayOfWeek, opensAtMinutes: r.startMinutes, closesAtMinutes: r.endMinutes }))),
  );
  const [weekErrors, setWeekErrors] = useState<Partial<Record<number, string>>>({});
  const [kind, setKind] = useState<'LEAVE' | 'BLOCK'>('LEAVE');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const format = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(iso));

  async function saveSessions(clear = false) {
    const result = toRows(clear ? week.map(() => []) : week);
    setWeekErrors(result.errors);
    if (Object.keys(result.errors).length > 0 || result.weekError) return setNotice({ tone: 'danger', text: result.weekError ?? 'Fix the days marked below.' });
    setBusy('sessions');
    const response = await api.put(`/api/v1/practices/${availability.practiceId}/availability/rules`, {
      rules: result.rows.map((r) => ({ dayOfWeek: r.dayOfWeek, startMinutes: r.opensAtMinutes, endMinutes: r.closesAtMinutes })),
    });
    setBusy(null);
    if (!response.ok) return setNotice({ tone: 'danger', text: response.message });
    if (clear) setWeek(week.map(() => []));
    setNotice({ tone: 'success', text: clear || result.rows.length === 0 ? 'Saved: bookable during the clinic’s opening hours.' : 'Sessions saved.' });
    router.refresh();
  }

  async function addException() {
    const startsAt = localDateTimeToIso(from, tz);
    const endsAt = localDateTimeToIso(to, tz);
    if (!startsAt || !endsAt) return setNotice({ tone: 'danger', text: 'Choose a start and an end.' });
    setBusy('exception');
    const response = await api.post(`/api/v1/practices/${availability.practiceId}/availability/exceptions`, {
      kind,
      startsAt,
      endsAt,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setBusy(null);
    if (!response.ok) return setNotice({ tone: 'danger', text: response.message });
    setFrom('');
    setTo('');
    setReason('');
    setNotice({ tone: 'success', text: kind === 'LEAVE' ? 'Leave added. Patients cannot book in that time.' : 'Block added.' });
    router.refresh();
  }

  async function removeException(id: string) {
    setBusy(id);
    const response = await api.delete(`/api/v1/practices/${availability.practiceId}/availability/exceptions?exceptionId=${encodeURIComponent(id)}`);
    setBusy(null);
    if (!response.ok) return setNotice({ tone: 'danger', text: response.message });
    router.refresh();
  }

  const clinicByDay = new Map<number, string[]>();
  for (const h of availability.clinicHours) {
    clinicByDay.set(h.dayOfWeek, [...(clinicByDay.get(h.dayOfWeek) ?? []), `${minutesToHHMM(h.startMinutes)}–${minutesToHHMM(h.endMinutes)}`]);
  }

  return (
    <Card label={title}>
      <CardHeader>
        <strong>{title}</strong>
      </CardHeader>
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

          <details>
            <summary>Clinic opening hours ({tz})</summary>
            <dl className="tl-kv">
              {WEEK_ORDER.map((d) => (
                <div key={d}>
                  <dt>{DAY_NAMES[d]}</dt>
                  <dd>{clinicByDay.get(d)?.join(', ') ?? 'Closed'}</dd>
                </div>
              ))}
            </dl>
          </details>

          <p className="tl-muted" style={{ margin: 0 }}>
            {availability.rules.length === 0
              ? 'No sessions set: you are bookable whenever the clinic is open. Set sessions to narrow that.'
              : 'Clinic visits are bookable only where your sessions and the clinic’s hours overlap.'}
          </p>
          <HoursEditor idPrefix={`avail-${availability.practiceId}`} value={week} onChange={setWeek} errors={weekErrors} />
          <div className="tl-inline">
            <Button loading={busy === 'sessions'} onClick={() => saveSessions()}>
              Save sessions
            </Button>
            {availability.rules.length > 0 ? (
              <Button variant="ghost" onClick={() => saveSessions(true)}>
                Use the clinic’s hours instead
              </Button>
            ) : null}
          </div>

          <h3 style={{ marginBlock: 'var(--tl-space-3) 0', fontSize: 'var(--tl-text-base)' }}>Leave and blocked time</h3>
          {availability.exceptions.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              None upcoming.
            </p>
          ) : (
            <ul className="tl-list">
              {availability.exceptions.map((e) => (
                <li key={e.id}>
                  <div className="tl-card__title-row">
                    <Badge tone={e.kind === 'LEAVE' ? 'warning' : 'neutral'}>{e.kind === 'LEAVE' ? 'Leave' : 'Blocked'}</Badge>
                    <span>
                      {format(e.startsAt)} – {format(e.endsAt)}
                    </span>
                    {e.reason ? <span className="tl-muted">{e.reason}</span> : null}
                    <Button size="sm" variant="ghost" loading={busy === e.id} onClick={() => removeException(e.id)}>
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="tl-form-grid">
            <Field label="Type">
              {(props) => (
                <select {...props} className="tl-input" value={kind} onChange={(e) => setKind(e.target.value as 'LEAVE' | 'BLOCK')}>
                  <option value="LEAVE">Leave (away)</option>
                  <option value="BLOCK">Block (not bookable)</option>
                </select>
              )}
            </Field>
            <Field label={`From (${tz})`}>
              {(props) => <Input {...props} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />}
            </Field>
            <Field label={`Until (${tz})`}>
              {(props) => <Input {...props} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />}
            </Field>
            <Field label="Reason" hint="Optional, internal.">
              {(props) => <Input {...props} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
            </Field>
          </div>
          <div>
            <Button variant="secondary" loading={busy === 'exception'} onClick={addException}>
              Add
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
