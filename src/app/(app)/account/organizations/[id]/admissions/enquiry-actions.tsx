/**
 * Work one admission enquiry: move it along, assign it, note, follow-up.
 * Offered by status; the API enforces the same transitions and permissions.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

const NEXT: Record<string, Array<{ action: string; label: string; needsNote?: boolean }>> = {
  NEW: [
    { action: 'CONTACTED', label: 'Mark contacted' },
    { action: 'APPLIED', label: 'Applied' },
    { action: 'LOST', label: 'Close', needsNote: true },
  ],
  CONTACTED: [
    { action: 'APPLIED', label: 'Applied' },
    { action: 'LOST', label: 'Close', needsNote: true },
  ],
  APPLIED: [
    { action: 'ADMITTED', label: 'Admitted' },
    { action: 'NOT_ADMITTED', label: 'Not admitted' },
    { action: 'LOST', label: 'Close', needsNote: true },
  ],
};

export function EnquiryActions({ enquiryId, status, canManage, assignedToUserId, members }: { enquiryId: string; status: string; canManage: boolean; assignedToUserId: string | null; members: ReadonlyArray<{ userId: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [at, setAt] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/enquiries/${enquiryId}/actions`, body, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPending(null);
    setNote('');
    setAt('');
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {canManage
          ? (NEXT[status] ?? []).map((a) => (
              <Button key={a.action} size="sm" variant={a.needsNote ? 'ghost' : 'secondary'} loading={busy && pending === a.action} onClick={() => (a.needsNote ? setPending(pending === a.action ? null : a.action) : (setPending(a.action), void send({ action: a.action }, 'Updated. The student has been told.')))}>
                {a.label}
              </Button>
            ))
          : null}
        {canManage ? (
          <Field label="Working this enquiry">
            {(props) => (
              <select {...props} className="tl-input" value={assignedToUserId ?? ''} disabled={busy} onChange={(e) => void send({ action: 'ASSIGN', assigneeUserId: e.target.value || null }, e.target.value ? 'Assigned.' : 'Unassigned.')}>
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
        <Button size="sm" variant="ghost" aria-expanded={pending === 'NOTE'} onClick={() => setPending(pending === 'NOTE' ? null : 'NOTE')}>
          Add note
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={pending === 'FOLLOW_UP'} onClick={() => setPending(pending === 'FOLLOW_UP' ? null : 'FOLLOW_UP')}>
          Follow-up
        </Button>
      </div>
      {pending === 'LOST' || pending === 'NOTE' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label={pending === 'LOST' ? 'Why is it closed?' : 'Note'}>
            {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" variant={pending === 'LOST' ? 'danger' : 'primary'} loading={busy} disabled={note.trim().length < 2} onClick={() => send({ action: pending, note: note.trim() }, pending === 'LOST' ? 'Closed. The student has been told.' : 'Note added.')}>
            {pending === 'LOST' ? 'Close enquiry' : 'Save note'}
          </Button>
        </div>
      ) : null}
      {pending === 'FOLLOW_UP' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Follow up on">
            {(props) => <Input {...props} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
          </Field>
          <Button size="sm" loading={busy} disabled={!at} onClick={() => send({ action: 'FOLLOW_UP', at: new Date(at).toISOString() }, 'Follow-up saved.')}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
