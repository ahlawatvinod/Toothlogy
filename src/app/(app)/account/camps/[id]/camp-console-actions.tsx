/**
 * Camp console controls: the camp's status (submit, cancel, complete; staff
 * review lives on /admin/camps), doctors' applications and attendance,
 * visits, and walk-in patients. The API enforces who may do each.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

function useSend() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  async function send(key: string, url: string, body: Record<string, unknown>, done: string) {
    setBusy(key);
    setNotice(null);
    const result = await api.post(url, body);
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return false;
    }
    setNotice({ tone: 'success', text: done });
    router.refresh();
    return true;
  }
  return { busy, notice, send };
}

export function CampStatusActions({ campId, status, isOrganizer, isStaff, started }: { campId: string; status: string; isOrganizer: boolean; isStaff: boolean; started: boolean }) {
  const { busy, notice, send } = useSend();
  const [note, setNote] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const url = `/api/v1/camps/${campId}/actions`;
  const canSubmit = isOrganizer && (status === 'DRAFT' || status === 'REJECTED') && !started;
  const canCancel = (isOrganizer || isStaff) && ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(status);
  const canComplete = (isOrganizer || isStaff) && status === 'APPROVED' && started;
  if (!canSubmit && !canCancel && !canComplete && !notice) return null;

  return (
    <Card label="Camp status">
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {canSubmit ? (
              <Button loading={busy === 'SUBMIT'} onClick={() => send('SUBMIT', url, { action: 'SUBMIT' }, 'Submitted. Toothlogy will review it; you will be told the decision.')}>
                Submit for review
              </Button>
            ) : null}
            {canComplete ? (
              <Button variant="secondary" loading={busy === 'COMPLETE'} onClick={() => send('COMPLETE', url, { action: 'COMPLETE' }, 'Completed. Patients who never checked in are recorded as not having come.')}>
                Mark camp completed
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="ghost" aria-expanded={cancelling} onClick={() => setCancelling((v) => !v)}>
                Cancel camp
              </Button>
            ) : null}
          </div>
          {cancelling ? (
            <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Why?" hint={status === 'APPROVED' ? 'Registered patients and doctors are told.' : undefined}>
                {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
              </Field>
              <Button variant="danger" loading={busy === 'CANCEL'} onClick={() => send('CANCEL', url, { action: 'CANCEL', ...(note.trim() ? { note: note.trim() } : {}) }, 'Camp cancelled.')}>
                Confirm cancellation
              </Button>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

export function DoctorDecision({ campDoctorId, status, started, attended }: { campDoctorId: string; status: string; started: boolean; attended: boolean }) {
  const { busy, notice, send } = useSend();
  const url = `/api/v1/camp-doctors/${campDoctorId}`;
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {status === 'APPLIED' ? (
          <>
            <Button size="sm" loading={busy === 'APPROVE'} onClick={() => send('APPROVE', url, { action: 'APPROVE' }, 'Confirmed. The dentist has been told.')}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" loading={busy === 'DECLINE'} onClick={() => send('DECLINE', url, { action: 'DECLINE' }, 'Declined. The dentist has been told.')}>
              Decline
            </Button>
          </>
        ) : null}
        {status === 'APPROVED' && started ? (
          <Button size="sm" variant="secondary" loading={busy === 'ATT'} onClick={() => send('ATT', url, { action: attended ? 'ABSENT' : 'ATTENDED' }, attended ? 'Marked absent.' : 'Marked attended.')}>
            {attended ? 'Mark absent' : 'Mark attended'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function VisitForm({ registrationId, doctors, findings, needsFollowUp, referredDentistProfileId }: { registrationId: string; doctors: ReadonlyArray<{ id: string; name: string }>; findings: string; needsFollowUp: boolean; referredDentistProfileId: string | null }) {
  const { busy, notice, send } = useSend();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(findings);
  const [follow, setFollow] = useState(needsFollowUp);
  const [referred, setReferred] = useState(referredDentistProfileId ?? '');
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Record visit
        </Button>
      </div>
      {open ? (
        <div className="tl-stack">
          <Field label="Findings">
            {(props) => <Input {...props} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />}
          </Field>
          <label className="tl-checkbox">
            <input type="checkbox" checked={follow} onChange={(e) => (setFollow(e.target.checked), e.target.checked ? undefined : setReferred(''))} />
            <span>Needs a follow-up visit</span>
          </label>
          {follow && doctors.length > 0 ? (
            <Field label="Refer to">
              {(props) => (
                <select {...props} className="tl-input" value={referred} onChange={(e) => setReferred(e.target.value)}>
                  <option value="">Any dentist</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
          <div>
            <Button
              size="sm"
              loading={busy === 'VISIT'}
              onClick={async () => {
                const ok = await send('VISIT', `/api/v1/camp-registrations/${registrationId}`, { op: 'VISIT', ...(notes.trim() ? { findings: notes.trim() } : {}), needsFollowUp: follow, referredDentistProfileId: follow && referred ? referred : null }, 'Visit recorded.');
                if (ok) setOpen(false);
              }}
            >
              Save visit
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WalkInForm({ campId }: { campId: string }) {
  const { busy, notice, send } = useSend();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [consent, setConsent] = useState(false);
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Add a walk-in patient
        </Button>
      </div>
      {open ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Name">
              {(props) => <Input {...props} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Mobile number">
              {(props) => <Input {...props} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <Field label="Age (optional)">
              {(props) => <Input {...props} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />}
            </Field>
          </div>
          <label className="tl-checkbox">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>The patient agreed that the camp’s organizer and dentists may keep their name, phone number and findings.</span>
          </label>
          <div>
            <Button
              size="sm"
              loading={busy === 'WALK'}
              disabled={!consent || name.trim().length < 2 || !phone.trim()}
              onClick={async () => {
                const ok = await send('WALK', `/api/v1/camps/${campId}/walk-ins`, { name: name.trim(), phone: phone.trim(), consentToShare: true, ...(age.trim() ? { age: Number(age) } : {}) }, 'Patient added.');
                if (ok) {
                  setName('');
                  setPhone('');
                  setAge('');
                  setConsent(false);
                }
              }}
            >
              Add patient
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
