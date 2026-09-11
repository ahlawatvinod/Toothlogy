/** Ask Toothlogy for help; then open the request. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function TicketForm({ categories, organizations }: { categories: ReadonlyArray<{ value: string; label: string }>; organizations: ReadonlyArray<{ id: string; name: string }> }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]?.value ?? 'OTHER');
  const [organizationId, setOrganizationId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (subject.trim().length < 5) return setError('Give it a short title.');
    if (body.trim().length < 10) return setError('Describe it in at least 10 characters.');
    setBusy(true);
    const result = await api.post<{ ticketId: string }>('/api/v1/support/tickets', { category, subject: subject.trim(), body: body.trim(), ...(organizationId ? { organizationId } : {}) }, { idempotencyKey: key });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push(`/help/tickets/${result.data.ticketId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="It is about">
          {(props) => (
            <select {...props} className="tl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {organizations.length > 0 ? (
          <Field label="For (optional)">
            {(props) => (
              <select {...props} className="tl-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                <option value="">Me</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      <Field label="Title">
        {(props) => <Input {...props} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} />}
      </Field>
      <Field label="What happened?" hint="What you did, what you expected, what happened instead.">
        {(props) => <textarea {...props} className="tl-input" rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Send to Toothlogy
        </Button>
      </div>
    </form>
  );
}
