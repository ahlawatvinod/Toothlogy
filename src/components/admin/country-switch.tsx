/** Open or close a country, with the reason recorded in the audit trail. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function CountrySwitch({ code, name, enabled, ready }: { code: string; name: string; enabled: boolean; ready: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function flip(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/admin/countries/${code}/enabled`, { enabled: !enabled, reason: reason.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setReason('');
    router.refresh();
  }

  if (!enabled && !ready) return <span className="tl-muted">Configure what is missing before opening {name}.</span>;
  return (
    <form onSubmit={flip} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label={enabled ? `Why close ${name}?` : `Why open ${name}?`}>{(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <Button type="submit" variant={enabled ? 'ghost' : 'primary'} loading={busy} disabled={reason.trim().length < 5}>
        {enabled ? `Close ${name} to new organizations` : `Open ${name}`}
      </Button>
    </form>
  );
}
