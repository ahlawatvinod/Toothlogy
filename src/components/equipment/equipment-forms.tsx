/**
 * Equipment and maintenance-contract forms for both sides.
 *
 * Practice: add equipment (optionally from a delivered order line), retire
 * or restore it, accept a proposed contract choosing what it covers or
 * decline it, request a visit, cancel a visit or contract. Business: propose
 * a contract to a practice it has traded with, schedule and complete visits,
 * cancel. Dates are entered as calendar days; amounts in rupees, sent in paise.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

function useSender() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  async function send(key: string, method: 'post' | 'patch', path: string, body: unknown, done: string, idempotent = false) {
    setBusy(key);
    setNotice(null);
    const result = method === 'post' ? await api.post(path, body, idempotent ? { idempotencyKey: newIdempotencyKey() } : undefined) : await api.patch(path, body);
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return false;
    }
    setNotice({ tone: 'success', text: done });
    router.refresh();
    return true;
  }
  return { busy, notice, setNotice, send };
}

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 && rupees.trim() !== '' ? String(Math.round(n * 100)) : null;
};

export function AddAssetForm({
  organizationId,
  categories,
  deliveredLines,
}: {
  organizationId: string;
  categories: ReadonlyArray<{ key: string; label: string }>;
  deliveredLines: ReadonlyArray<{ id: string; label: string; name: string }>;
}) {
  const { busy, notice, send } = useSender();
  const [form, setForm] = useState({ name: '', category: categories[0]?.key ?? 'equipment', brand: '', model: '', serialNumber: '', purchasedOn: '', warrantyUntil: '', orderLineId: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await send(
      'add',
      'post',
      `/api/v1/organizations/${organizationId}/equipment`,
      {
        name: form.name.trim(),
        category: form.category,
        ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
        ...(form.model.trim() ? { model: form.model.trim() } : {}),
        ...(form.serialNumber.trim() ? { serialNumber: form.serialNumber.trim() } : {}),
        ...(form.purchasedOn ? { purchasedOn: form.purchasedOn } : {}),
        ...(form.warrantyUntil ? { warrantyUntil: form.warrantyUntil } : {}),
        ...(form.orderLineId ? { orderLineId: form.orderLineId } : {}),
      },
      'Added to the register.',
      true,
    );
    if (ok) setForm((f) => ({ ...f, name: '', brand: '', model: '', serialNumber: '', purchasedOn: '', warrantyUntil: '', orderLineId: '' }));
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {deliveredLines.length > 0 ? (
        <Field label="Bought through Toothlogy (optional)" hint="Fills in the supplier and purchase date.">
          {(p) => (
            <select
              {...p}
              className="tl-input"
              value={form.orderLineId}
              onChange={(e) => setForm((f) => ({ ...f, orderLineId: e.target.value, name: f.name || (deliveredLines.find((l) => l.id === e.target.value)?.name ?? '') }))}
            >
              <option value="">No</option>
              {deliveredLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Equipment" required>
          {(p) => <Input {...p} maxLength={120} value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Kind">
          {(p) => (
            <select {...p} className="tl-input" value={form.category} onChange={set('category')}>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Brand (optional)">{(p) => <Input {...p} maxLength={80} value={form.brand} onChange={set('brand')} />}</Field>
        <Field label="Model (optional)">{(p) => <Input {...p} maxLength={80} value={form.model} onChange={set('model')} />}</Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Serial number (optional)">{(p) => <Input {...p} maxLength={60} value={form.serialNumber} onChange={set('serialNumber')} />}</Field>
        <Field label="Bought on (optional)">{(p) => <Input {...p} type="date" value={form.purchasedOn} onChange={set('purchasedOn')} />}</Field>
        <Field label="Warranty until (optional)">{(p) => <Input {...p} type="date" value={form.warrantyUntil} onChange={set('warrantyUntil')} />}</Field>
      </div>
      <div>
        <Button type="submit" loading={busy === 'add'} disabled={form.name.trim().length < 2}>
          Add equipment
        </Button>
      </div>
    </form>
  );
}

export function AssetStatusButton({ assetId, retired, name }: { assetId: string; retired: boolean; name: string }) {
  const { busy, notice, send } = useSender();
  return (
    <span className="tl-inline" style={{ flexWrap: 'wrap' }}>
      <Button size="sm" variant="ghost" loading={busy === 'status'} aria-label={`${retired ? 'Put back in use' : 'Retire'} ${name}`} onClick={() => send('status', 'patch', `/api/v1/equipment/${assetId}`, { status: retired ? 'IN_USE' : 'RETIRED' }, retired ? 'Back in use.' : 'Retired.')}>
        {retired ? 'Put back in use' : 'Retire'}
      </Button>
      {notice?.tone === 'danger' ? <span role="alert" className="tl-field__error">{notice.text}</span> : null}
    </span>
  );
}

/** A reason box and send button for decline / cancel style actions. */
export function ReasonAction({ label, button, path, body, done }: { label: string; button: string; path: string; body: Record<string, unknown>; done: string }) {
  const { busy, notice, send } = useSender();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {button}
        </Button>
      </div>
      {open ? (
        <div className="tl-stack">
          <Field label={label} required>
            {(p) => <textarea {...p} className="tl-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" loading={busy === 'reason'} disabled={note.trim().length < 3} onClick={() => send('reason', 'post', path, { ...body, note: note.trim() }, done)}>
              Send
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ContractDecision({ contractId, assets }: { contractId: string; assets: ReadonlyArray<{ id: string; name: string }> }) {
  const { busy, notice, send } = useSender();
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {assets.length > 0 ? (
        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Equipment this contract covers</legend>
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {assets.map((a) => (
              <label key={a.id} className="tl-checkbox">
                <input type="checkbox" checked={chosen.includes(a.id)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, a.id] : c.filter((x) => x !== a.id)))} />
                <span>{a.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <Button size="sm" loading={busy === 'accept'} onClick={() => send('accept', 'post', `/api/v1/service-contracts/${contractId}/actions`, { action: 'ACCEPT', assetIds: chosen }, 'Contract accepted. The business has been told.')}>
          Accept contract
        </Button>
      </div>
      <ReasonAction label="Why you are declining" button="Decline" path={`/api/v1/service-contracts/${contractId}/actions`} body={{ action: 'DECLINE' }} done="Declined. The business has been told." />
    </div>
  );
}

export function VisitRequestForm({ contractId, assets }: { contractId: string; assets: ReadonlyArray<{ id: string; name: string }> }) {
  const { busy, notice, send } = useSender();
  const [kind, setKind] = useState<'PREVENTIVE' | 'BREAKDOWN'>('PREVENTIVE');
  const [assetId, setAssetId] = useState('');
  const [issue, setIssue] = useState('');
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Visit">
          {(p) => (
            <select {...p} className="tl-input" value={kind} onChange={(e) => setKind(e.target.value as 'PREVENTIVE' | 'BREAKDOWN')}>
              <option value="PREVENTIVE">Preventive visit</option>
              <option value="BREAKDOWN">Breakdown call</option>
            </select>
          )}
        </Field>
        {assets.length > 0 ? (
          <Field label="For (optional)">
            {(p) => (
              <select {...p} className="tl-input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Any covered equipment</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      <Field label="What is wrong" hint={kind === 'BREAKDOWN' ? 'Required for a breakdown call.' : 'Optional.'}>
        {(p) => <textarea {...p} className="tl-input" rows={2} maxLength={2000} value={issue} onChange={(e) => setIssue(e.target.value)} />}
      </Field>
      <div>
        <Button
          size="sm"
          loading={busy === 'visit'}
          onClick={async () => {
            if (await send('visit', 'post', `/api/v1/service-contracts/${contractId}/visits`, { kind, ...(assetId ? { assetId } : {}), ...(issue.trim() ? { issue: issue.trim() } : {}) }, 'Visit requested. The business has been told.', true)) setIssue('');
          }}
        >
          Request visit
        </Button>
      </div>
    </div>
  );
}

export function ProposeContractForm({ organizationId, partners, today }: { organizationId: string; partners: ReadonlyArray<{ id: string; name: string }>; today: string }) {
  const { busy, notice, send } = useSender();
  const [form, setForm] = useState({ clientOrganizationId: partners[0]?.id ?? '', kind: 'AMC', startsOn: today, endsOn: '', visitsIncluded: '2', responseHours: '', price: '', terms: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const priceMinor = toPaise(form.price);
    if (!priceMinor) return void send('noop', 'post', '', null, '').then(() => undefined);
    await send(
      'propose',
      'post',
      `/api/v1/organizations/${organizationId}/service-contracts`,
      {
        kind: form.kind,
        clientOrganizationId: form.clientOrganizationId,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        visitsIncluded: Number(form.visitsIncluded) || 0,
        ...(form.responseHours.trim() ? { responseHours: Number(form.responseHours) } : {}),
        priceMinor,
        ...(form.terms.trim() ? { terms: form.terms.trim() } : {}),
      },
      'Proposed. The practice has been told.',
      true,
    );
  }
  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Practice" required>
          {(p) => (
            <select {...p} className="tl-input" value={form.clientOrganizationId} onChange={set('clientOrganizationId')}>
              {partners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Contract">
          {(p) => (
            <select {...p} className="tl-input" value={form.kind} onChange={set('kind')}>
              <option value="AMC">AMC (annual maintenance)</option>
              <option value="CMC">CMC (comprehensive, parts included)</option>
            </select>
          )}
        </Field>
        <Field label="Starts" required>{(p) => <Input {...p} type="date" value={form.startsOn} onChange={set('startsOn')} />}</Field>
        <Field label="Ends" required>{(p) => <Input {...p} type="date" value={form.endsOn} onChange={set('endsOn')} />}</Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Preventive visits included">{(p) => <Input {...p} inputMode="numeric" value={form.visitsIncluded} onChange={set('visitsIncluded')} />}</Field>
        <Field label="Breakdown response (hours, optional)">{(p) => <Input {...p} inputMode="numeric" value={form.responseHours} onChange={set('responseHours')} />}</Field>
        <Field label="Price (rupees, GST included)" required>{(p) => <Input {...p} inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
      </div>
      <Field label="Terms (optional)">{(p) => <textarea {...p} className="tl-input" rows={3} maxLength={4000} value={form.terms} onChange={set('terms')} />}</Field>
      <div>
        <Button type="submit" loading={busy === 'propose'} disabled={!form.clientOrganizationId || !form.endsOn || !form.price.trim()}>
          Propose contract
        </Button>
      </div>
    </form>
  );
}

export function VisitProviderActions({ visitId }: { visitId: string }) {
  const { busy, notice, send } = useSender();
  const [when, setWhen] = useState('');
  const [report, setReport] = useState('');
  const path = `/api/v1/service-visits/${visitId}/actions`;
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Visit on">{(p) => <Input {...p} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />}</Field>
        <Button size="sm" variant="secondary" loading={busy === 'schedule'} disabled={!when} onClick={() => send('schedule', 'post', path, { action: 'SCHEDULE', scheduledFor: new Date(when).toISOString() }, 'Scheduled. The practice has been told.')}>
          Schedule
        </Button>
      </div>
      <Field label="Work done">{(p) => <textarea {...p} className="tl-input" rows={2} maxLength={4000} value={report} onChange={(e) => setReport(e.target.value)} />}</Field>
      <div>
        <Button size="sm" loading={busy === 'complete'} disabled={report.trim().length < 5} onClick={() => send('complete', 'post', path, { action: 'COMPLETE', report: report.trim() }, 'Completed. The practice has been told.')}>
          Mark completed
        </Button>
      </div>
    </div>
  );
}
