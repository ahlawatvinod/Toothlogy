/**
 * The actions on a treatment plan: the patient accepts or declines; the
 * proposing practice records each treatment and may withdraw the plan. Each
 * shows the server's answer — nothing changes on screen unless it saved.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(key: string, path: string, body: unknown) {
    setBusy(key);
    setError(null);
    const result = await api.post(path, body);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    router.refresh();
    return true;
  }
  return { busy, error, run };
}

export function PlanDecision({ planId, title }: { planId: string; title: string }) {
  const { busy, error, run } = useAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const path = `/api/v1/treatment-plans/${planId}/decision`;
  return (
    <div className="tl-stack" role="group" aria-label={`Decide on ${title}`}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" loading={busy === 'accept'} disabled={busy !== null} onClick={() => void run('accept', path, { decision: 'ACCEPT' })}>
          Accept plan
        </Button>
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setDeclining(true)}>
          Decline plan
        </Button>
      </div>
      {declining ? (
        <div className="tl-stack">
          <Field label="Why (optional)" hint="The practice sees this.">
            {(p) => <Input {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" variant="secondary" loading={busy === 'decline'} onClick={() => void run('decline', path, { decision: 'DECLINE', ...(reason.trim() ? { reason: reason.trim() } : {}) })}>
              Confirm decline
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PlanItemActions({ planId, itemId, label }: { planId: string; itemId: string; label: string }) {
  const { busy, error, run } = useAction();
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState('');
  const path = `/api/v1/treatment-plans/${planId}/items/${itemId}`;
  return (
    <div className="tl-stack" role="group" aria-label={`Progress on ${label}`}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" loading={busy === 'done'} disabled={busy !== null} onClick={() => void run('done', path, { status: 'DONE' })}>
          Mark done
        </Button>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setSkipping(true)}>
          Not done
        </Button>
      </div>
      {skipping ? (
        <div className="tl-stack">
          <Field label="Why it was not done" required>
            {(p) => <Input {...p} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" variant="secondary" loading={busy === 'skip'} disabled={reason.trim().length < 2} onClick={() => void run('skip', path, { status: 'SKIPPED', reason: reason.trim() })}>
              Record as not done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CancelPlan({ planId, title }: { planId: string; title: string }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="tl-stack" role="group" aria-label={`Withdraw ${title}`}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {open ? (
        <>
          <Field label="Why the plan is withdrawn" required hint="The patient sees this.">
            {(p) => <Input {...p} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" variant="secondary" loading={busy === 'cancel'} disabled={reason.trim().length < 3} onClick={() => void run('cancel', `/api/v1/treatment-plans/${planId}/cancel`, { reason: reason.trim() })}>
              Confirm withdrawal
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            Withdraw plan
          </Button>
        </div>
      )}
    </div>
  );
}
