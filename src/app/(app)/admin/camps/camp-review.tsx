/** Approve or reject a submitted camp; a rejection says why. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function CampReview({ campId, own }: { campId: string; own: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (own) return <p className="tl-muted" style={{ margin: 0 }}>You organize this camp, so another reviewer must decide it.</p>;

  async function decide(action: 'APPROVE' | 'REJECT') {
    setBusy(action);
    setError(null);
    const result = await api.post(`/api/v1/camps/${campId}/actions`, { action, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Note to the organizer" hint="Required to reject.">
        {(props) => <Input {...props} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" loading={busy === 'APPROVE'} onClick={() => decide('APPROVE')}>
          Approve
        </Button>
        <Button size="sm" variant="danger" loading={busy === 'REJECT'} disabled={note.trim().length < 3} onClick={() => decide('REJECT')}>
          Reject
        </Button>
      </div>
    </div>
  );
}
