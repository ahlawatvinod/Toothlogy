/** Print or save the prescription as PDF; the issuing practice may cancel it. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function PrescriptionActions({ prescriptionId, canCancel }: { prescriptionId: string; canCancel: boolean }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/prescriptions/${prescriptionId}/cancel`, { reason: reason.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setCancelling(false);
    router.refresh();
  }

  return (
    <div className="tl-stack tl-no-print">
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
        {canCancel && !cancelling ? (
          <Button type="button" variant="ghost" onClick={() => setCancelling(true)}>
            Cancel this prescription
          </Button>
        ) : null}
      </div>
      {cancelling ? (
        <form onSubmit={cancel} className="tl-form" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Why cancel it? The patient sees this, and the pharmacy check shows it as cancelled.">
            {(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <div className="tl-inline">
            <Button type="submit" variant="secondary" loading={busy} disabled={reason.trim().length < 5}>
              Cancel prescription
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>
              Keep it
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
