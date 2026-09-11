/** Enrol an admitted student; mark an enrolment completed or withdrawn. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function EnrolAction({ enquiryId, academicYear, today }: { enquiryId: string; academicYear: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(academicYear);
  const [roll, setRoll] = useState('');
  const [startedOn, setStartedOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enrol(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/enquiries/${enquiryId}/enrolment`, { academicYear: year.trim(), startedOn, ...(roll.trim() ? { rollNumber: roll.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  if (!open) {
    return (
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Enrol
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={enrol} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Academic year">{(props) => <Input {...props} maxLength={7} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-27" />}</Field>
      <Field label="Roll number (optional)">{(props) => <Input {...props} maxLength={40} value={roll} onChange={(e) => setRoll(e.target.value)} />}</Field>
      <Field label="Starts on">{(props) => <Input {...props} type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />}</Field>
      <Button type="submit" size="sm" loading={busy}>
        Enrol student
      </Button>
    </form>
  );
}

export function EndEnrolment({ enrolmentId, today }: { enrolmentId: string; today: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'COMPLETED' | 'WITHDRAWN' | null>(null);
  const [endedOn, setEndedOn] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end(event: React.FormEvent) {
    event.preventDefault();
    if (!status) return;
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/enrolments/${enrolmentId}/end`, { status, endedOn, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  if (!status) {
    return (
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" size="sm" variant="secondary" onClick={() => setStatus('COMPLETED')}>
          Mark completed
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setStatus('WITHDRAWN')}>
          Record withdrawal
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={end} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={status === 'COMPLETED' ? 'Completed on' : 'Withdrew on'}>{(props) => <Input {...props} type="date" max={today} value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />}</Field>
      {status === 'WITHDRAWN' ? <Field label="Reason">{(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field> : null}
      <Button type="submit" size="sm" loading={busy}>
        {status === 'COMPLETED' ? 'Save completion' : 'Save withdrawal'}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setStatus(null)}>
        Cancel
      </Button>
    </form>
  );
}
