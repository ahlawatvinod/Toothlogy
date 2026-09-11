/**
 * Actions in camp history: ask the referred dentist to call (the ordinary
 * callback request, attributed to the camp visit), cancel a registration,
 * withdraw as a doctor.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function run(url: string, body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(url, body, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    router.refresh();
  }
  return { busy, notice, run };
}

export function FollowUpCall({ practiceId, dentistName }: { practiceId: string; dentistName: string }) {
  const { busy, notice, run } = useAction();
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {notice?.tone !== 'success' ? (
        <div>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => run('/api/v1/leads/callback', { practiceId, note: 'Follow-up after a dental camp.' }, `Sent. ${dentistName}’s practice will call you.`)}>
            Ask {dentistName} to call me
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CancelRegistration({ registrationId }: { registrationId: string }) {
  const { busy, notice, run } = useAction();
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => run(`/api/v1/camp-registrations/${registrationId}`, { op: 'CANCEL' }, 'Registration cancelled.')}>
          Cancel my registration
        </Button>
      </div>
    </div>
  );
}

export function WithdrawFromCamp({ campDoctorId }: { campDoctorId: string }) {
  const { busy, notice, run } = useAction();
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => run(`/api/v1/camp-doctors/${campDoctorId}`, { action: 'WITHDRAW' }, 'Withdrawn.')}>
          Withdraw
        </Button>
      </div>
    </div>
  );
}
