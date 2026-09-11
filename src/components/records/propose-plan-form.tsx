/**
 * Propose a treatment plan: a title, optional notes, who it is for, and up to
 * twenty treatments — each with what it is (optionally from the catalogue),
 * the teeth (FDI) and a tax-inclusive estimate. The patient decides; nothing
 * says "proposed" unless the server saved it.
 */

'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

interface Row {
  readonly key: number;
  description: string;
  treatmentKey: string;
  teeth: string;
  estimate: string;
}

const MAX_ROWS = 20;
let nextKey = 1;
const blankRow = (): Row => ({ key: nextKey++, description: '', treatmentKey: '', teeth: '', estimate: '' });

export function ProposePlanForm({
  endpoint,
  currency,
  dependents,
  treatments,
}: {
  endpoint: string;
  currency: string;
  dependents: ReadonlyArray<{ id: string; name: string }>;
  treatments: ReadonlyArray<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dependentId, setDependentId] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const update = (key: number, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api.post<{ planId: string }>(endpoint, {
      title: title.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(dependentId ? { dependentId } : {}),
      items: rows.map((r) => ({
        description: r.description.trim(),
        ...(r.treatmentKey ? { treatmentKey: r.treatmentKey } : {}),
        ...(r.teeth.trim() ? { teeth: r.teeth.trim() } : {}),
        estimate: r.estimate.trim(),
      })),
    });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Proposed. The patient has been told and will accept or decline it.' });
    setTitle('');
    setNotes('');
    setDependentId('');
    setRows([blankRow()]);
    router.refresh();
  }

  return (
    <form className="tl-form" onSubmit={submit} noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <Field label="Plan title" required hint="For example: Restore the upper right molars.">
        {(p) => <Input {...p} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label="Notes for the patient" hint="Optional. Plain language: what, why, how many visits.">
        {(p) => <textarea {...p} className="tl-input" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />}
      </Field>
      {dependents.length > 0 ? (
        <Field label="For">
          {(p) => (
            <select {...p} className="tl-input" value={dependentId} onChange={(e) => setDependentId(e.target.value)}>
              <option value="">The account holder</option>
              {dependents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {rows.map((row, index) => (
        <fieldset key={row.key} className="tl-fieldset">
          <legend className="tl-fieldset__legend">Treatment {index + 1}</legend>
          <div className="tl-form-grid">
            <Field label="What" required>
              {(p) => <Input {...p} value={row.description} maxLength={200} onChange={(e) => update(row.key, { description: e.target.value })} />}
            </Field>
            <Field label="From the catalogue" hint="Optional.">
              {(p) => (
                <select {...p} className="tl-input" value={row.treatmentKey} onChange={(e) => update(row.key, { treatmentKey: e.target.value })}>
                  <option value="">—</option>
                  {treatments.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Teeth (FDI)" hint="For example: 16, 17.">
              {(p) => <Input {...p} value={row.teeth} maxLength={120} onChange={(e) => update(row.key, { teeth: e.target.value })} />}
            </Field>
            <Field label={`Estimate (${currency}, including tax)`} required>
              {(p) => <Input {...p} inputMode="decimal" value={row.estimate} maxLength={13} onChange={(e) => update(row.key, { estimate: e.target.value })} />}
            </Field>
          </div>
          {rows.length > 1 ? (
            <div>
              <Button size="sm" variant="ghost" onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}>
                Remove treatment {index + 1}
              </Button>
            </div>
          ) : null}
        </fieldset>
      ))}

      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {rows.length < MAX_ROWS ? (
          <Button size="sm" variant="secondary" onClick={() => setRows((all) => [...all, blankRow()])}>
            Add a treatment
          </Button>
        ) : null}
        <Button type="submit" loading={busy}>
          Propose plan
        </Button>
      </div>
    </form>
  );
}
