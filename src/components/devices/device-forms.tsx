/**
 * Equipment controls: register a device (its token shown once, with how to
 * send a reading), edit its limits, re-key it, retire it, resolve an alert.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { DEVICE_KINDS } from '@/platform/devices/labels';

function OneTimeToken({ token, telemetryUrl }: { token: string; telemetryUrl: string }) {
  return (
    <Alert tone="warning">
      <div className="tl-stack">
        <span>
          <strong>Copy this token now — it is shown only once.</strong> Configure it on the device; Toothlogy keeps only a fingerprint of it.
        </span>
        <code aria-label="Device token" style={{ wordBreak: 'break-all' }}>
          {token}
        </code>
        <span className="tl-muted">The device sends readings like this:</span>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{`POST ${telemetryUrl}\nAuthorization: Device ${token}\nContent-Type: application/json\n\n{"readings":[{"metric":"temperature_c","value":134}]}`}</pre>
      </div>
    </Alert>
  );
}

export function RegisterDeviceForm({ organizationId, telemetryUrl }: { organizationId: string; telemetryUrl: string }) {
  const router = useRouter();
  const [kind, setKind] = useState('AUTOCLAVE');
  const [name, setName] = useState('');
  const [serial, setSerial] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ deviceId: string; token: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post<{ deviceId: string; token: string }>(`/api/v1/organizations/${organizationId}/devices`, { kind, name: name.trim(), ...(serial.trim() ? { serialNumber: serial.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setIssued(result.data);
    setName('');
    setSerial('');
    router.refresh();
  }

  if (issued) {
    return (
      <div className="tl-stack">
        <OneTimeToken token={issued.token} telemetryUrl={telemetryUrl} />
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          <Link href={`/account/organizations/${organizationId}/devices/${issued.deviceId}`}>Open the device</Link>
          <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
            Register another
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Kind">
          {(props) => (
            <select {...props} className="tl-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {DEVICE_KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Name">{(props) => <Input {...props} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Autoclave, operatory 2" />}</Field>
        <Field label="Serial number (optional)">{(props) => <Input {...props} maxLength={80} value={serial} onChange={(e) => setSerial(e.target.value)} />}</Field>
      </div>
      <div>
        <Button type="submit" loading={busy}>
          Register device
        </Button>
      </div>
    </form>
  );
}

interface LimitRow {
  key: number;
  metric: string;
  min: string;
  max: string;
}

export function LimitsEditor({ deviceId, limits, suggestions }: { deviceId: string; limits: ReadonlyArray<{ metric: string; min: number | null; max: number | null }>; suggestions: readonly string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<LimitRow[]>(() => (limits.length ? limits.map((l, i) => ({ key: i + 1, metric: l.metric, min: l.min == null ? '' : String(l.min), max: l.max == null ? '' : String(l.max) })) : [{ key: 1, metric: suggestions[0] ?? '', min: '', max: '' }]));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const set = (k: number, field: 'metric' | 'min' | 'max', value: string) => setRows((rs) => rs.map((r) => (r.key === k ? { ...r, [field]: value } : r)));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
    const payload = rows.filter((r) => r.metric.trim()).map((r) => ({ metric: r.metric.trim(), ...(num(r.min) !== undefined ? { min: num(r.min) } : {}), ...(num(r.max) !== undefined ? { max: num(r.max) } : {}) }));
    const result = await api.put(`/api/v1/devices/${deviceId}/limits`, { limits: payload });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Limits saved. New readings are checked against them.' });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="tl-form" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <ol className="tl-list" aria-label="Limits">
        {rows.map((r, i) => (
          <li key={r.key} aria-label={`Limit ${i + 1}`} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Reading" hint={i === 0 ? `e.g. ${suggestions.join(', ')}` : undefined}>
              {(props) => <Input {...props} maxLength={40} value={r.metric} onChange={(e) => set(r.key, 'metric', e.target.value)} />}
            </Field>
            <Field label="Lowest">{(props) => <Input {...props} inputMode="decimal" value={r.min} onChange={(e) => set(r.key, 'min', e.target.value)} />}</Field>
            <Field label="Highest">{(props) => <Input {...props} inputMode="decimal" value={r.max} onChange={(e) => set(r.key, 'max', e.target.value)} />}</Field>
            {rows.length > 1 ? (
              <Button type="button" variant="ghost" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, { key: Math.max(0, ...rs.map((x) => x.key)) + 1, metric: '', min: '', max: '' }])}>
          Add a reading
        </Button>
        <Button type="submit" loading={busy}>
          Save limits
        </Button>
      </div>
    </form>
  );
}

export function DeviceActions({ deviceId, telemetryUrl, active }: { deviceId: string; telemetryUrl: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  async function rekey() {
    setBusy('token');
    setError(null);
    const result = await api.post<{ token: string }>(`/api/v1/devices/${deviceId}/token`, {});
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setToken(result.data.token);
    router.refresh();
  }
  async function retire() {
    setBusy('retire');
    setError(null);
    const result = await api.post(`/api/v1/devices/${deviceId}/retire`, {});
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  if (!active) return null;
  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {token ? <OneTimeToken token={token} telemetryUrl={telemetryUrl} /> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" loading={busy === 'token'} onClick={rekey}>
          Issue a new token
        </Button>
        {confirmRetire ? (
          <>
            <Button type="button" variant="secondary" loading={busy === 'retire'} onClick={retire}>
              Yes, retire it
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmRetire(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmRetire(true)}>
            Retire device
          </Button>
        )}
      </div>
    </div>
  );
}

export function ResolveAlert({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/device-alerts/${alertId}/resolve`, note.trim() ? { note: note.trim() } : {});
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <form onSubmit={resolve} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="What was done (optional)">{(props) => <Input {...props} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <Button type="submit" variant="secondary" loading={busy}>
        Resolve
      </Button>
    </form>
  );
}
