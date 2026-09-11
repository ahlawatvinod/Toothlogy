/**
 * Open outreach for every eligible subject in a district, shared between the
 * chosen operators. Running it again only adds subjects without an open task.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

const PURPOSES = [
  ['ACTIVATE_ACCOUNT', 'Invite pre-made dentists to activate'],
  ['CLAIM_LISTING', 'Invite owners to claim clinic, hospital and college listings'],
  ['VERIFY_DETAILS', 'Check low-confidence records'],
  ['RETENTION', 'Help live practices'],
] as const;

export function BulkOutreach({ districts, agents }: { districts: ReadonlyArray<{ id: string; label: string }>; agents: ReadonlyArray<{ userId: string; name: string }> }) {
  const router = useRouter();
  const [districtId, setDistrictId] = useState(districts[0]?.id ?? '');
  const [purpose, setPurpose] = useState<string>('ACTIVATE_ACCOUNT');
  const [chosen, setChosen] = useState<string[]>([]);
  const [due, setDue] = useState('');
  const [limit, setLimit] = useState('100');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const n = Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 500) return setNotice({ tone: 'danger', text: 'Open between 1 and 500 tasks at a time.' });
    setBusy(true);
    const result = await api.post<{ candidates: number; created: number }>('/api/v1/admin/outreach/bulk', {
      districtId,
      purpose,
      assigneeUserIds: chosen,
      limit: n,
      ...(due ? { dueAt: new Date(`${due}T18:00:00+05:30`).toISOString() } : {}),
    });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: result.data.created === 0 ? 'Nothing new to open: every eligible record already has an open task, or there are none.' : `${result.data.created} task${result.data.created === 1 ? '' : 's'} opened.` });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="District">
          {(props) => (
            <select {...props} className="tl-input" value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Purpose">
          {(props) => (
            <select {...props} className="tl-input" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {PURPOSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Due by (optional)">
          {(props) => <Input {...props} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
        </Field>
        <Field label="At most">
          {(props) => <Input {...props} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />}
        </Field>
      </div>
      <fieldset className="tl-fieldset">
        <legend className="tl-fieldset__legend">Share between (none ticked: leave unassigned)</legend>
        {agents.length === 0 ? <p className="tl-muted">Nobody holds an operations role yet.</p> : null}
        {agents.map((a) => (
          <label key={a.userId} className="tl-checkbox">
            <input type="checkbox" checked={chosen.includes(a.userId)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.userId] : c.filter((x) => x !== a.userId)))} />
            <span>{a.name}</span>
          </label>
        ))}
      </fieldset>
      <p className="tl-muted" style={{ margin: 0 }}>
        Outreach is done by people — calls, visits, and activation invitations through Toothlogy. Nothing is sent automatically to extracted contacts.
      </p>
      <div>
        <Button type="submit" loading={busy} disabled={!districtId}>
          Open outreach
        </Button>
      </div>
    </form>
  );
}
