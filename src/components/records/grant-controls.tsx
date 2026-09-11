/**
 * The patient's controls over who sees their record — answer a request, share
 * with a practice, withdraw — and the practice's "ask to see it".
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { GRANT_DURATIONS } from '@/platform/records/labels';

function Terms({ canWrite, setCanWrite, days, setDays }: { canWrite: boolean; setCanWrite: (v: boolean) => void; days: string; setDays: (v: string) => void }) {
  return (
    <div className="tl-stack">
      <label className="tl-checkbox">
        <input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} />
        <span>Also let them add to it (notes, X-rays, prescriptions)</span>
      </label>
      <Field label="For how long">
        {(props) => (
          <select {...props} className="tl-input" value={days} onChange={(e) => setDays(e.target.value)}>
            {GRANT_DURATIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}

export function RespondToRequest({ grantId, practice }: { grantId: string; practice: string }) {
  const router = useRouter();
  const [canWrite, setCanWrite] = useState(true);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(decision: 'APPROVE' | 'DECLINE') {
    setBusy(decision);
    setError(null);
    const result = await api.post(`/api/v1/me/records/grants/${grantId}/respond`, decision === 'APPROVE' ? { decision, canWrite, days } : { decision });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Terms canWrite={canWrite} setCanWrite={setCanWrite} days={days} setDays={setDays} />
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" loading={busy === 'APPROVE'} onClick={() => answer('APPROVE')}>
          Allow {practice}
        </Button>
        <Button type="button" variant="ghost" loading={busy === 'DECLINE'} onClick={() => answer('DECLINE')}>
          Decline
        </Button>
      </div>
    </div>
  );
}

export function WithdrawAccess({ grantId, practice }: { grantId: string; practice: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/me/records/grants/${grantId}/revoke`, {});
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <span className="tl-inline" style={{ flexWrap: 'wrap' }}>
      {confirming ? (
        <>
          <Button type="button" variant="secondary" loading={busy} onClick={withdraw}>
            Yes, withdraw {practice}’s access
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Keep it
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
          Withdraw access
        </Button>
      )}
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}

export function ShareRecordForm({ practices }: { practices: ReadonlyArray<{ organizationId: string; name: string }> }) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(practices[0]?.organizationId ?? '');
  const [canWrite, setCanWrite] = useState(false);
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function share(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api.post('/api/v1/me/records/grants', { organizationId, canWrite, days });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Shared. You can withdraw it at any time.' });
    router.refresh();
  }

  return (
    <form onSubmit={share} className="tl-form" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <Field label="Practice">
        {(props) => (
          <select {...props} className="tl-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            {practices.map((p) => (
              <option key={p.organizationId} value={p.organizationId}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Terms canWrite={canWrite} setCanWrite={setCanWrite} days={days} setDays={setDays} />
      <div>
        <Button type="submit" loading={busy}>
          Share my record
        </Button>
      </div>
    </form>
  );
}

export function RequestAccessButton({ organizationId, userId, name }: { organizationId: string; userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/organizations/${organizationId}/patients/${userId}/access-request`, note.trim() ? { note: note.trim() } : {});
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Ask {name} to share their record
      </Button>
    );
  }
  return (
    <form onSubmit={ask} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="A note for the patient (optional)">{(props) => <Input {...props} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <div className="tl-inline">
        <Button type="submit" loading={busy}>
          Send request
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
