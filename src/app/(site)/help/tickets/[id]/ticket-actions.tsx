/**
 * Reply to a support request; staff may make it an internal note, set the
 * status and assign it; the requester may close it.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function TicketActions({ ticketId, isStaff, status, agents, assignedToUserId }: { ticketId: string; isStaff: boolean; status: string; agents: ReadonlyArray<{ userId: string; name: string }>; assignedToUserId: string | null }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function call(key: string, url: string, payload: Record<string, unknown>, done: string, idempotent = false) {
    setBusy(key);
    setNotice(null);
    const result = await api.post(url, payload, idempotent ? { idempotencyKey: newIdempotencyKey() } : undefined);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    if (key === 'reply') setBody('');
    router.refresh();
  }

  return (
    <Card label="Reply">
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <Field label={internal ? 'Internal note (staff only)' : 'Your reply'}>
            {(props) => <textarea {...props} className="tl-input" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          {isStaff ? (
            <label className="tl-checkbox">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <span>Internal note — the requester will not see it</span>
            </label>
          ) : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            <Button loading={busy === 'reply'} disabled={body.trim().length < 10} onClick={() => call('reply', `/api/v1/support/tickets/${ticketId}/replies`, { body: body.trim(), internal }, internal ? 'Note added.' : 'Sent.', true)}>
              {internal ? 'Add note' : 'Send'}
            </Button>
            {isStaff && status !== 'RESOLVED' ? (
              <Button variant="secondary" loading={busy === 'RESOLVED'} onClick={() => call('RESOLVED', `/api/v1/support/tickets/${ticketId}/status`, { status: 'RESOLVED' }, 'Marked resolved. The requester has been told.')}>
                Mark resolved
              </Button>
            ) : null}
            {isStaff && status === 'RESOLVED' ? (
              <Button variant="secondary" loading={busy === 'OPEN'} onClick={() => call('OPEN', `/api/v1/support/tickets/${ticketId}/status`, { status: 'OPEN' }, 'Reopened.')}>
                Reopen
              </Button>
            ) : null}
            <Button variant="ghost" loading={busy === 'CLOSED'} onClick={() => call('CLOSED', `/api/v1/support/tickets/${ticketId}/status`, { status: 'CLOSED' }, 'Closed.')}>
              Close request
            </Button>
          </div>
          {isStaff ? (
            <Field label="Assigned to">
              {(props) => (
                <select {...props} className="tl-input" value={assignedToUserId ?? ''} disabled={busy !== null} onChange={(e) => void call('assign', `/api/v1/admin/support/tickets/${ticketId}/assign`, { assignedToUserId: e.target.value || null }, 'Assigned.')}>
                  <option value="">Nobody (queue)</option>
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
      </CardBody>
    </Card>
  );
}
