/** Start a conversation with a practice; then open it. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function NewThreadForm({ practices, organizationId, appointmentId }: { practices: ReadonlyArray<{ organizationId: string; name: string }>; organizationId?: string; appointmentId?: string }) {
  const router = useRouter();
  const [org, setOrg] = useState(organizationId && practices.some((p) => p.organizationId === organizationId) ? organizationId : (practices[0]?.organizationId ?? ''));
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (subject.trim().length < 3) return setError('Say what it is about.');
    if (body.trim().length < 2) return setError('Write a message.');
    setBusy(true);
    const result = await api.post<{ threadId: string }>('/api/v1/messages/threads', { organizationId: org, ...(appointmentId && org === organizationId ? { appointmentId } : {}), subject: subject.trim(), body: body.trim() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push(`/account/messages/${result.data.threadId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Practice">
        {(props) => (
          <select {...props} className="tl-input" value={org} onChange={(e) => setOrg(e.target.value)}>
            {practices.map((p) => (
              <option key={p.organizationId} value={p.organizationId}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {appointmentId && org === organizationId ? <p className="tl-muted" style={{ margin: 0 }}>About your appointment with them.</p> : null}
      <Field label="Subject">
        {(props) => <Input {...props} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />}
      </Field>
      <Field label="Message">
        {(props) => <textarea {...props} className="tl-input" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Send message
        </Button>
      </div>
    </form>
  );
}
