/**
 * Per-entry actions: the patient deletes what they added (after a second
 * click); a practice retracts its own entry with a reason the patient sees.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function DeleteEntryButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await api.delete(`/api/v1/me/records/entries/${entryId}`);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <span className="tl-inline" style={{ flexWrap: 'wrap' }}>
      {confirming ? (
        <>
          <Button type="button" variant="secondary" loading={busy} onClick={remove}>
            Yes, delete it
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}

export function RetractEntryForm({ organizationId, entryId }: { organizationId: string; entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retract(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/organizations/${organizationId}/record-entries/${entryId}/retract`, { reason: reason.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Retract
      </Button>
    );
  }
  return (
    <form onSubmit={retract} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Why retract it? The patient sees this.">{(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <div className="tl-inline">
        <Button type="submit" variant="secondary" loading={busy} disabled={reason.trim().length < 5}>
          Retract entry
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
