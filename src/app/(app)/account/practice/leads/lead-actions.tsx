/**
 * Actions on one lead, offered by its status; the API enforces the same
 * transitions and the practice boundary.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

const ACTIONS: Record<string, Array<{ action: string; label: string; needsReason?: boolean }>> = {
  DELIVERED: [
    { action: 'ACCEPT', label: 'Accept' },
    { action: 'REJECT', label: 'Decline', needsReason: true },
  ],
  ACCEPTED: [
    { action: 'CONTACTED', label: 'Mark contacted' },
    { action: 'MARK_APPOINTMENT', label: 'Appointment made' },
    { action: 'LOST', label: 'Mark lost', needsReason: true },
  ],
  CONTACTED: [
    { action: 'MARK_APPOINTMENT', label: 'Appointment made' },
    { action: 'LOST', label: 'Mark lost', needsReason: true },
  ],
  COMPLETED: [{ action: 'CONVERTED', label: 'Mark converted (went ahead with treatment)' }],
};

const DISPUTE_REASONS = [
  { value: 'WRONG_CONTACT', label: 'Contact details did not work' },
  { value: 'DUPLICATE', label: 'Duplicate of another lead' },
  { value: 'SPAM', label: 'Spam or fake' },
  { value: 'OUT_OF_AREA', label: 'Outside our area' },
  { value: 'NOT_A_PATIENT', label: 'Not a patient enquiry' },
  { value: 'OTHER', label: 'Other (explain)' },
];

export function LeadActions({ leadId, status, canManage, canDispute }: { leadId: string; status: string; canManage: boolean; canDispute: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [disputing, setDisputing] = useState(false);
  const [disputeReason, setDisputeReason] = useState('WRONG_CONTACT');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const actions = canManage ? (ACTIONS[status] ?? []) : [];
  if (actions.length === 0 && !canDispute && !notice) return null;

  async function run(action: string) {
    setBusy(true);
    const result = await api.post(`/api/v1/leads/${leadId}/actions`, { action, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setPending(null);
    setReason('');
    router.refresh();
  }

  async function dispute() {
    setBusy(true);
    const result = await api.post(`/api/v1/leads/${leadId}/dispute`, { reason: disputeReason, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setDisputing(false);
    setNotice({ tone: 'success', text: 'Dispute raised. Toothlogy staff will decide; an upheld dispute is refunded to your wallet.' });
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.needsReason ? 'secondary' : 'primary'}
            loading={busy && pending === a.action}
            onClick={() => (a.needsReason ? setPending(pending === a.action ? null : a.action) : (setPending(a.action), void run(a.action)))}
          >
            {a.label}
          </Button>
        ))}
        {canDispute ? (
          <Button size="sm" variant="ghost" onClick={() => setDisputing((v) => !v)} aria-expanded={disputing}>
            Dispute charge
          </Button>
        ) : null}
      </div>
      {pending && actions.find((a) => a.action === pending)?.needsReason ? (
        <div className="tl-inline">
          <Field label="Reason">
            {(props) => <Input {...props} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy} onClick={() => (reason.trim().length < 3 ? setNotice({ tone: 'danger', text: 'Give a reason.' }) : run(pending))}>
            Confirm
          </Button>
        </div>
      ) : null}
      {disputing ? (
        <div className="tl-stack">
          <Field label="Why is this charge wrong?">
            {(props) => (
              <select {...props} className="tl-input" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}>
                {DISPUTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Details" hint={disputeReason === 'OTHER' ? 'Required.' : 'Optional.'}>
            {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" loading={busy} onClick={dispute}>
              Raise dispute
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
