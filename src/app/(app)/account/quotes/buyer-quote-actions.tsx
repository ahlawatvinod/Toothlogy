/** Accept a quote, or withdraw the request. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function BuyerQuoteActions({ quoteRequestId, canAccept }: { quoteRequestId: string; canAccept: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'ACCEPT' | 'WITHDRAW') {
    setBusy(action);
    setError(null);
    const result = await api.post(`/api/v1/quotes/${quoteRequestId}/actions`, { action }, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {canAccept ? (
          <Button size="sm" loading={busy === 'ACCEPT'} onClick={() => act('ACCEPT')}>
            Accept quote
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" loading={busy === 'WITHDRAW'} onClick={() => act('WITHDRAW')}>
          Withdraw request
        </Button>
      </div>
    </div>
  );
}
