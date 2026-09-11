/** Withdraw an open admission enquiry, after confirming. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function WithdrawEnquiry({ enquiryId }: { enquiryId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    const result = await api.post(`/api/v1/enquiries/${enquiryId}/actions`, { action: 'WITHDRAW' }, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {confirming ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <span>The college will see it was withdrawn. You can enquire again later.</span>
          <Button size="sm" variant="danger" loading={busy} onClick={withdraw}>
            Withdraw enquiry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </div>
      ) : (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Withdraw
          </Button>
        </div>
      )}
    </div>
  );
}
