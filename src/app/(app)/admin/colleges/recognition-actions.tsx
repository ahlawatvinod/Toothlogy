/** Mark a college's stated recognition as checked, or withdraw the check. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function RecognitionActions({ organizationId, verified, canVerify }: { organizationId: string; verified: boolean; canVerify: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'VERIFY' | 'WITHDRAW') {
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/admin/colleges/${organizationId}/recognition`, { decision, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setNote('');
    router.refresh();
  }

  if (!verified && !canVerify) return <span className="tl-muted">Nothing to check</span>;
  return (
    <div className="tl-stack" style={{ minWidth: '12rem' }}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="What you checked">
        {(props) => <Input {...props} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {verified ? (
        <Button size="sm" variant="danger" loading={busy} onClick={() => decide('WITHDRAW')}>
          Withdraw check
        </Button>
      ) : (
        <Button size="sm" loading={busy} disabled={note.trim().length < 3} onClick={() => decide('VERIFY')}>
          Mark checked
        </Button>
      )}
    </div>
  );
}
