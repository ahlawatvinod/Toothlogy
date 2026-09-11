/** Confirm or decline a faculty request, or end a confirmed post. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/design-system';
import { api } from '@/lib/api-client';

export function FacultyDecision({ appointmentId, status }: { appointmentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'CONFIRM' | 'DECLINE' | 'END') {
    setBusy(decision);
    setError(null);
    const result = await api.post(`/api/v1/faculty-appointments/${appointmentId}`, { decision });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {status === 'PENDING' ? (
          <>
            <Button size="sm" loading={busy === 'CONFIRM'} onClick={() => decide('CONFIRM')}>
              Confirm
            </Button>
            <Button size="sm" variant="ghost" loading={busy === 'DECLINE'} onClick={() => decide('DECLINE')}>
              Decline
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" loading={busy === 'END'} onClick={() => decide('END')}>
            End this post
          </Button>
        )}
      </div>
    </div>
  );
}
