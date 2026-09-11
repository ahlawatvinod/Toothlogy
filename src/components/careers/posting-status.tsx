/** Publish, close, reopen or mark filled. Publishing needs a verified organization. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/design-system';
import { api } from '@/lib/api-client';

export function PostingStatus({ postingId, status }: { postingId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function to(next: 'OPEN' | 'CLOSED' | 'FILLED') {
    setBusy(next);
    setError(null);
    const result = await api.post(`/api/v1/postings/${postingId}/status`, { status: next });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {status !== 'OPEN' ? (
          <Button type="button" loading={busy === 'OPEN'} onClick={() => to('OPEN')}>
            {status === 'DRAFT' ? 'Publish' : 'Reopen'}
          </Button>
        ) : null}
        {status === 'OPEN' ? (
          <Button type="button" variant="secondary" loading={busy === 'CLOSED'} onClick={() => to('CLOSED')}>
            Close to new applications
          </Button>
        ) : null}
        {status === 'OPEN' || status === 'CLOSED' ? (
          <Button type="button" variant="ghost" loading={busy === 'FILLED'} onClick={() => to('FILLED')}>
            Mark filled
          </Button>
        ) : null}
      </div>
    </div>
  );
}
