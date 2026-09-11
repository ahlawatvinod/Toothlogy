/**
 * Prime forms: buy a plan from the lead wallet, turn renewal on or off (the
 * practice); create a plan and put it on sale or retire it (staff). Prices
 * are entered in rupees and sent in paise.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

export function BuyPlanButton({ organizationId, planId, planName, price }: { organizationId: string; planId: string; planName: string; price: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [key] = useState(newIdempotencyKey);

  async function buy() {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/organizations/${organizationId}/prime`, { planId }, { idempotencyKey: key });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: `Welcome to Prime. ${price} was charged to your lead wallet.` });
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {!confirming ? (
        <div>
          <Button onClick={() => setConfirming(true)}>Join {planName}</Button>
        </div>
      ) : (
        <div className="tl-stack">
          <p style={{ margin: 0 }}>
            {price} will be charged to your lead wallet now, and again each period while renewal is on.
          </p>
          <div className="tl-inline">
            <Button loading={busy} onClick={buy}>
              Confirm and pay {price}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoRenewToggle({ membershipId, autoRenew, endsOn }: { membershipId: string; autoRenew: boolean; endsOn: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  async function toggle() {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/memberships/${membershipId}/auto-renew`, { autoRenew: !autoRenew });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: autoRenew ? `Renewal is off. Prime stays until ${endsOn}.` : 'Renewal is on.' });
    router.refresh();
  }
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        <Button variant="secondary" size="sm" loading={busy} onClick={toggle}>
          {autoRenew ? 'Turn renewal off' : 'Turn renewal on'}
        </Button>
      </div>
    </div>
  );
}

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 && rupees.trim() !== '' ? String(Math.round(n * 100)) : null;
};

export function PlanForm({ countries }: { countries: ReadonlyArray<{ code: string; name: string }> }) {
  const router = useRouter();
  const [form, setForm] = useState({ code: '', name: '', audience: 'ORGANIZATION', countryCode: countries[0]?.code ?? 'IN', price: '', periodMonths: '12', bonusFreeLeads: '0', primeBadge: true, prioritySupport: true, description: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const set = (k: 'code' | 'name' | 'audience' | 'countryCode' | 'price' | 'periodMonths' | 'bonusFreeLeads' | 'description') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const forOrganizations = form.audience === 'ORGANIZATION';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const priceMinor = toPaise(form.price);
    if (!priceMinor) return setNotice({ tone: 'danger', text: 'Enter the price per period in rupees, before tax.' });
    setBusy(true);
    setNotice(null);
    const result = await api.post(
      '/api/v1/admin/prime/plans',
      {
        code: form.code.trim(),
        name: form.name.trim(),
        audience: form.audience,
        countryCode: form.countryCode,
        priceMinor,
        periodMonths: Number(form.periodMonths),
        bonusFreeLeads: forOrganizations ? Number(form.bonusFreeLeads) || 0 : 0,
        primeBadge: forOrganizations && form.primeBadge,
        prioritySupport: form.prioritySupport,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
      },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Plan saved as a draft. Put it on sale when it is right.' });
    setForm((f) => ({ ...f, code: '', name: '', description: '' }));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Plan name" required>{(p) => <Input {...p} maxLength={80} value={form.name} onChange={set('name')} />}</Field>
        <Field label="Code" required hint="Lowercase, e.g. prime-clinic-annual.">{(p) => <Input {...p} maxLength={40} value={form.code} onChange={set('code')} />}</Field>
        <Field label="For">
          {(p) => (
            <select {...p} className="tl-input" value={form.audience} onChange={set('audience')}>
              <option value="ORGANIZATION">Practices and businesses</option>
              <option value="INDIVIDUAL">Individuals (needs a payment provider)</option>
            </select>
          )}
        </Field>
        <Field label="Country">
          {(p) => (
            <select {...p} className="tl-input" value={form.countryCode} onChange={set('countryCode')}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Price per period (rupees, before tax)" required>{(p) => <Input {...p} inputMode="decimal" value={form.price} onChange={set('price')} />}</Field>
        <Field label="Period">
          {(p) => (
            <select {...p} className="tl-input" value={form.periodMonths} onChange={set('periodMonths')}>
              {['1', '3', '6', '12', '24'].map((m) => (
                <option key={m} value={m}>
                  {m} {m === '1' ? 'month' : 'months'}
                </option>
              ))}
            </select>
          )}
        </Field>
        {forOrganizations ? <Field label="Bonus free leads per period">{(p) => <Input {...p} inputMode="numeric" value={form.bonusFreeLeads} onChange={set('bonusFreeLeads')} />}</Field> : null}
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {forOrganizations ? (
          <label className="tl-checkbox">
            <input type="checkbox" checked={form.primeBadge} onChange={(e) => setForm((f) => ({ ...f, primeBadge: e.target.checked }))} />
            <span>“Prime member” badge on public pages (never affects ranking)</span>
          </label>
        ) : null}
        <label className="tl-checkbox">
          <input type="checkbox" checked={form.prioritySupport} onChange={(e) => setForm((f) => ({ ...f, prioritySupport: e.target.checked }))} />
          <span>Priority support</span>
        </label>
      </div>
      <Field label="Description (optional)">{(p) => <textarea {...p} className="tl-input" rows={2} maxLength={1000} value={form.description} onChange={set('description')} />}</Field>
      <div>
        <Button type="submit" loading={busy} disabled={form.name.trim().length < 3 || form.code.trim().length < 3}>
          Save draft plan
        </Button>
      </div>
    </form>
  );
}

export function PlanActions({ planId, status }: { planId: string; status: 'DRAFT' | 'ACTIVE' | 'RETIRED' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  if (status === 'RETIRED') return null;
  async function act(action: 'ACTIVATE' | 'RETIRE') {
    setBusy(true);
    setNotice(null);
    const result = await api.patch(`/api/v1/admin/prime/plans/${planId}`, { action });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: action === 'ACTIVATE' ? 'On sale.' : 'Retired: current periods run to their end and do not renew.' });
    router.refresh();
  }
  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div>
        {status === 'DRAFT' ? (
          <Button size="sm" loading={busy} onClick={() => act('ACTIVATE')}>
            Put on sale
          </Button>
        ) : (
          <Button size="sm" variant="ghost" loading={busy} onClick={() => act('RETIRE')}>
            Retire
          </Button>
        )}
      </div>
    </div>
  );
}
