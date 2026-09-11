/** Keep a flagged review, hide it with a reason, or restore a hidden one. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function ReviewModeration({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'HIDE' | 'RESTORE' | 'KEEP') {
    setBusy(action);
    setError(null);
    const result = await api.post(`/api/v1/admin/reviews/${reviewId}/moderate`, { action, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {hidden ? (
        <div>
          <Button size="sm" variant="secondary" loading={busy === 'RESTORE'} onClick={() => act('RESTORE')}>
            Restore
          </Button>
        </div>
      ) : (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Button size="sm" loading={busy === 'KEEP'} onClick={() => act('KEEP')}>
            Keep it up
          </Button>
          <Field label="Reason the patient will see">
            {(props) => <Input {...props} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy === 'HIDE'} disabled={reason.trim().length < 3} onClick={() => act('HIDE')}>
            Hide
          </Button>
        </div>
      )}
    </div>
  );
}
