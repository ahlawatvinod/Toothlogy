/**
 * Work on one outreach task: take it, log a call or visit or note, complete,
 * cancel (leads), reassign (leads), send an activation invitation. Each
 * submission carries its own idempotency key, so a double click logs once.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

const TYPES = [
  ['CALL', 'Call'],
  ['VISIT', 'Visit'],
  ['WHATSAPP', 'WhatsApp message (sent yourself)'],
  ['EMAIL', 'Email (sent yourself)'],
  ['SMS', 'SMS (sent yourself)'],
  ['NOTE', 'Note'],
] as const;
const OUTCOMES = [
  ['CONNECTED', 'Connected'],
  ['NO_ANSWER', 'No answer'],
  ['BUSY', 'Busy'],
  ['WRONG_NUMBER', 'Wrong number'],
  ['CALLBACK_REQUESTED', 'Asked to call back'],
  ['INTERESTED', 'Interested'],
  ['NOT_INTERESTED', 'Not interested'],
  ['ONBOARDED', 'Onboarded'],
] as const;

export function TaskActions({
  taskId,
  mine,
  unassigned,
  isLead,
  selfId,
  agents,
  canInvite,
  invitesConfigured,
}: {
  taskId: string;
  mine: boolean;
  unassigned: boolean;
  isLead: boolean;
  selfId: string;
  agents: ReadonlyArray<{ userId: string; name: string }>;
  canInvite: boolean;
  invitesConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [panel, setPanel] = useState<'log' | 'close' | null>(null);
  const [type, setType] = useState('CALL');
  const [outcome, setOutcome] = useState('CONNECTED');
  const [note, setNote] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [closeAction, setCloseAction] = useState<'COMPLETE' | 'CANCEL'>('COMPLETE');
  const canWork = mine || unassigned || isLead;

  async function send(op: string, body: Record<string, unknown>, done: string) {
    setBusy(op);
    setNotice(null);
    const result = await api.post(`/api/v1/admin/outreach/tasks/${taskId}`, { op, ...body }, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    setNote('');
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {unassigned ? (
          <Button size="sm" loading={busy === 'ASSIGN'} onClick={() => send('ASSIGN', { assignedToUserId: selfId }, 'The task is yours.')}>
            Take this task
          </Button>
        ) : null}
        {canWork ? (
          <>
            <Button size="sm" variant="secondary" aria-expanded={panel === 'log'} onClick={() => setPanel(panel === 'log' ? null : 'log')}>
              Log activity
            </Button>
            <Button size="sm" variant="ghost" aria-expanded={panel === 'close'} onClick={() => setPanel(panel === 'close' ? null : 'close')}>
              Close task
            </Button>
          </>
        ) : null}
        {canInvite && canWork ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={!invitesConfigured}
            title={invitesConfigured ? undefined : 'Email and SMS are not configured'}
            loading={busy === 'INVITE'}
            onClick={() => send('INVITE', {}, 'Activation link sent by email and code by SMS.')}
          >
            Send activation invitation
          </Button>
        ) : null}
        {isLead ? (
          <Field label="Assigned to">
            {(props) => (
              <select
                {...props}
                className="tl-input"
                value=""
                onChange={(e) => (e.target.value ? void send('ASSIGN', { assignedToUserId: e.target.value === 'none' ? null : e.target.value }, 'Reassigned.') : undefined)}
              >
                <option value="">Reassign…</option>
                <option value="none">Nobody</option>
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      {canInvite && !invitesConfigured ? <p className="tl-muted" style={{ margin: 0 }}>Activation invitations need email and SMS delivery, which are not configured. Ask the dentist to open /activate instead.</p> : null}

      {panel === 'log' ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="What">
              {(props) => (
                <select {...props} className="tl-input" value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {type !== 'NOTE' ? (
              <Field label="Outcome">
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
            ) : null}
            <Field label="Next contact (optional)">
              {(props) => <Input {...props} type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />}
            </Field>
          </div>
          <Field label="Note">
            {(props) => <Input {...props} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div>
            <Button
              size="sm"
              loading={busy === 'LOG'}
              onClick={() =>
                send(
                  'LOG',
                  { type, ...(type !== 'NOTE' ? { outcome } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(nextDue ? { nextDueAt: new Date(nextDue).toISOString() } : {}) },
                  'Logged.',
                )
              }
            >
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'close' ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Close as">
              {(props) => (
                <select {...props} className="tl-input" value={closeAction} onChange={(e) => setCloseAction(e.target.value as 'COMPLETE' | 'CANCEL')}>
                  <option value="COMPLETE">Done</option>
                  {isLead ? <option value="CANCEL">Cancelled</option> : null}
                </select>
              )}
            </Field>
            {closeAction === 'COMPLETE' ? (
              <Field label="Outcome">
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
            ) : null}
          </div>
          <Field label={closeAction === 'CANCEL' ? 'Reason' : 'Note (optional)'}>
            {(props) => <Input {...props} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div>
            <Button
              size="sm"
              variant={closeAction === 'CANCEL' ? 'danger' : 'primary'}
              loading={busy === 'CLOSE'}
              onClick={() => send('CLOSE', { action: closeAction, ...(closeAction === 'COMPLETE' ? { outcome } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, closeAction === 'COMPLETE' ? 'Task done.' : 'Task cancelled.')}
            >
              {closeAction === 'COMPLETE' ? 'Mark done' : 'Cancel task'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
