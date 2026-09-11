/**
 * Staff forms for exchange rates and enterprise agreements: record a rate;
 * record an agreement from the signed contract; put an organization into or
 * out of a group; end an agreement with a reason.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

function useSend() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  async function send(path: string, body: unknown, done: string, idempotent = false) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(path, body, idempotent ? { idempotencyKey: newIdempotencyKey() } : undefined);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return false;
    }
    setNotice({ tone: 'success', text: done });
    router.refresh();
    return true;
  }
  return { busy, notice, send };
}

export function RecordRateForm({ currencies, today }: { currencies: ReadonlyArray<{ code: string; name: string }>; today: string }) {
  const { busy, notice, send } = useSend();
  const [form, setForm] = useState({ baseCurrency: 'USD', quoteCurrency: 'INR', rate: '', source: '', asOf: today });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const currencySelect = (k: 'baseCurrency' | 'quoteCurrency', label: string) => (
    <Field label={label}>
      {(p) => (
        <select {...p} className="tl-input" value={form[k]} onChange={set(k)}>
          {currencies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  return (
    <form
      className="tl-stack"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (await send('/api/v1/admin/exchange-rates', form, 'Rate recorded.', true)) setForm((f) => ({ ...f, rate: '' }));
      }}
    >
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {currencySelect('baseCurrency', 'One unit of')}
        {currencySelect('quoteCurrency', 'In')}
        <Field label="Rate" hint="Up to six decimal places.">{(p) => <Input {...p} inputMode="decimal" value={form.rate} onChange={set('rate')} />}</Field>
        <Field label="As of">{(p) => <Input {...p} type="date" max={today} value={form.asOf} onChange={set('asOf')} />}</Field>
      </div>
      <Field label="Source" hint="Where the rate comes from, for example “RBI reference rate”.">{(p) => <Input {...p} maxLength={120} value={form.source} onChange={set('source')} />}</Field>
      <div>
        <Button type="submit" loading={busy} disabled={!form.rate.trim() || form.source.trim().length < 3}>
          Record rate
        </Button>
      </div>
    </form>
  );
}

export function AgreementForm({ groups, countries, today }: { groups: ReadonlyArray<{ id: string; name: string }>; countries: ReadonlyArray<{ code: string; name: string }>; today: string }) {
  const { busy, notice, send } = useSend();
  const [form, setForm] = useState({ organizationId: groups[0]?.id ?? '', reference: '', startsOn: today, endsOn: '', firstResponseHours: '4', resolutionHours: '48', dataResidency: 'IN', ssoRequired: false, notes: '' });
  const set = (k: Exclude<keyof typeof form, 'ssoRequired'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="tl-stack"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        await send(
          '/api/v1/admin/enterprise',
          { ...form, firstResponseHours: Number(form.firstResponseHours), resolutionHours: Number(form.resolutionHours), notes: form.notes.trim() || null },
          'Agreement recorded. The group has been told.',
          true,
        );
      }}
    >
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Group">
          {(p) => (
            <select {...p} className="tl-input" value={form.organizationId} onChange={set('organizationId')}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Contract reference" required>{(p) => <Input {...p} maxLength={60} value={form.reference} onChange={set('reference')} />}</Field>
        <Field label="Starts" required>{(p) => <Input {...p} type="date" value={form.startsOn} onChange={set('startsOn')} />}</Field>
        <Field label="Ends" required>{(p) => <Input {...p} type="date" value={form.endsOn} onChange={set('endsOn')} />}</Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="First response (hours)">{(p) => <Input {...p} inputMode="numeric" value={form.firstResponseHours} onChange={set('firstResponseHours')} />}</Field>
        <Field label="Resolution (hours)">{(p) => <Input {...p} inputMode="numeric" value={form.resolutionHours} onChange={set('resolutionHours')} />}</Field>
        <Field label="Data held in">
          {(p) => (
            <select {...p} className="tl-input" value={form.dataResidency} onChange={set('dataResidency')}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <label className="tl-checkbox">
        <input type="checkbox" checked={form.ssoRequired} onChange={(e) => setForm((f) => ({ ...f, ssoRequired: e.target.checked }))} />
        <span>Single sign-on through the group’s identity provider is required</span>
      </label>
      <Field label="Notes (optional)">{(p) => <textarea {...p} className="tl-input" rows={2} maxLength={2000} value={form.notes} onChange={set('notes')} />}</Field>
      <div>
        <Button type="submit" loading={busy} disabled={!form.organizationId || form.reference.trim().length < 3 || !form.endsOn}>
          Record agreement
        </Button>
      </div>
    </form>
  );
}

export function MembershipForm({ groups, organizations }: { groups: ReadonlyArray<{ id: string; name: string }>; organizations: ReadonlyArray<{ id: string; name: string; group: string | null }> }) {
  const { busy, notice, send } = useSend();
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [member, setMember] = useState('');
  const [reason, setReason] = useState('');
  const chosen = organizations.find((o) => o.id === member);
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Organization">
          {(p) => (
            <select {...p} className="tl-input" value={member} onChange={(e) => setMember(e.target.value)}>
              <option value="">Choose…</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.group ? ` (in ${o.group})` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
        {!chosen?.group ? (
          <Field label="Into group">
            {(p) => (
              <select {...p} className="tl-input" value={group} onChange={(e) => setGroup(e.target.value)}>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field label="Reason">{(p) => <Input {...p} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </div>
      <div>
        <Button
          size="sm"
          loading={busy}
          disabled={!member || reason.trim().length < 3}
          onClick={() =>
            send(
              '/api/v1/admin/enterprise/members',
              chosen?.group ? { action: 'UNLINK', memberOrganizationId: member, reason: reason.trim() } : { action: 'LINK', groupOrganizationId: group, memberOrganizationId: member, reason: reason.trim() },
              chosen?.group ? 'Taken out of the group.' : 'Added to the group.',
            )
          }
        >
          {chosen?.group ? 'Take out of its group' : 'Add to the group'}
        </Button>
      </div>
    </div>
  );
}

export function EndAgreementButton({ agreementId }: { agreementId: string }) {
  const { busy, notice, send } = useSend();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          End agreement
        </Button>
      </div>
      {open ? (
        <div className="tl-inline" style={{ alignItems: 'flex-end' }}>
          <Field label="Why it ends">{(p) => <Input {...p} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Button size="sm" loading={busy} disabled={reason.trim().length < 3} onClick={() => send(`/api/v1/admin/enterprise/${agreementId}/end`, { reason: reason.trim() }, 'Agreement ended.')}>
            End
          </Button>
        </div>
      ) : null}
    </div>
  );
}
