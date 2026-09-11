/**
 * The employer's controls on one application: the next moves for its status
 * (an interview needs a time), an optional message the applicant sees, and an
 * internal note.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { NEXT_ACTIONS } from '@/platform/careers/labels';

export function ApplicationActions({ applicationId, status, employerNote }: { applicationId: string; status: string; employerNote: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [note, setNote] = useState(employerNote);
  const [interviewAt, setInterviewAt] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const actions = NEXT_ACTIONS[status] ?? [];

  async function act(action: string) {
    setBusy(action);
    setNotice(null);
    const payload: Record<string, unknown> = { action };
    if (action === 'NOTE') payload.employerNote = note.trim();
    else if (message.trim()) payload.message = message.trim();
    if (action === 'INTERVIEW') payload.interviewAt = interviewAt ? new Date(interviewAt).toISOString() : '';
    const result = await api.post(`/api/v1/applications/${applicationId}/actions`, payload);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: action === 'NOTE' ? 'Note saved.' : 'Done. The applicant has been told.' });
    setMessage('');
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {actions.length > 0 ? (
        <>
          <Field label="Message to the applicant (optional)">{(props) => <Input {...props} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}</Field>
          {actions.some(([a]) => a === 'INTERVIEW') ? (
            <Field label="Interview time (for an interview)">{(props) => <Input {...props} type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />}</Field>
          ) : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {actions.map(([action, label]) => (
              <Button key={action} type="button" variant={action === 'REJECT' ? 'ghost' : 'secondary'} loading={busy === action} onClick={() => act(action)}>
                {label}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <Field label="Internal note (only your organization sees it)">{(props) => <Input {...props} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <div>
        <Button type="button" variant="ghost" loading={busy === 'NOTE'} onClick={() => act('NOTE')}>
          Save note
        </Button>
      </div>
    </div>
  );
}

export function WithdrawApplication({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/applications/${applicationId}/withdraw`, {});
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <span className="tl-inline" style={{ flexWrap: 'wrap' }}>
      {confirming ? (
        <>
          <Button type="button" variant="secondary" loading={busy} onClick={withdraw}>
            Yes, withdraw
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
          Withdraw
        </Button>
      )}
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}
