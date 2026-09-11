/**
 * Working one lead: who has it, log a call, schedule the next one, add a
 * note. Offered to administrators, the assignee and (through the API) the
 * lead's dentist; the API enforces the same, and refuses to log a call before
 * the patient's number is visible.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

const OUTCOMES = [
  ['CONNECTED', 'Spoke to the patient'],
  ['NO_ANSWER', 'No answer'],
  ['BUSY', 'Busy'],
  ['WRONG_NUMBER', 'Wrong number'],
  ['CALLBACK_REQUESTED', 'Asked us to call back'],
  ['NOT_INTERESTED', 'Not interested'],
] as const;

export function LeadWork({
  leadId,
  canAssign,
  members,
  assignedToUserId,
  contactVisible,
  nextFollowUpAt,
}: {
  leadId: string;
  canAssign: boolean;
  members: ReadonlyArray<{ userId: string; name: string }>;
  assignedToUserId: string | null;
  contactVisible: boolean;
  nextFollowUpAt: string | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<'call' | 'follow' | 'note' | null>(null);
  const [outcome, setOutcome] = useState('CONNECTED');
  const [note, setNote] = useState('');
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/leads/${leadId}/work`, body, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    setNote('');
    setAt('');
    router.refresh();
  }
  const iso = (local: string) => new Date(local).toISOString();

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {canAssign ? (
          <Field label="Working this lead">
            {(props) => (
              <select {...props} className="tl-input" value={assignedToUserId ?? ''} disabled={busy} onChange={(e) => void send({ kind: 'ASSIGN', assigneeUserId: e.target.value || null }, e.target.value ? 'Assigned.' : 'Unassigned.')}>
                <option value="">Nobody</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Button size="sm" variant="secondary" aria-expanded={panel === 'call'} disabled={!contactVisible} title={contactVisible ? undefined : 'The number is shown once the lead is free or paid for'} onClick={() => setPanel(panel === 'call' ? null : 'call')}>
          Log a call
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={panel === 'follow'} onClick={() => setPanel(panel === 'follow' ? null : 'follow')}>
          {nextFollowUpAt ? 'Change follow-up' : 'Schedule follow-up'}
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={panel === 'note'} onClick={() => setPanel(panel === 'note' ? null : 'note')}>
          Add note
        </Button>
      </div>

      {panel === 'call' ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="How did it go?">
              {(props) => (
                <select {...props} className="tl-input" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  {OUTCOMES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Call again (optional)">
              {(props) => <Input {...props} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
            </Field>
          </div>
          <Field label="Note (optional)">
            {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" loading={busy} onClick={() => send({ kind: 'CALL', outcome, ...(note.trim() ? { note: note.trim() } : {}), ...(at ? { followUpAt: iso(at) } : {}) }, 'Call logged.')}>
              Save call
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'follow' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Follow up on">
            {(props) => <Input {...props} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
          </Field>
          <Button size="sm" loading={busy} disabled={!at} onClick={() => send({ kind: 'FOLLOW_UP', at: iso(at) }, 'Follow-up scheduled. You will be reminded when it is due.')}>
            Save
          </Button>
          {nextFollowUpAt ? (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => send({ kind: 'FOLLOW_UP', at: null }, 'Follow-up cleared.')}>
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      {panel === 'note' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Note">
            {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" loading={busy} disabled={note.trim().length < 2} onClick={() => send({ kind: 'NOTE', note: note.trim() }, 'Note added.')}>
            Save note
          </Button>
        </div>
      ) : null}
    </div>
  );
}
