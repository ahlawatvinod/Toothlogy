/**
 * The interactive parts of the directory data console: importing a CSV of
 * extracted rows, importing a district list, and acting on one record.
 * Files are read in the browser and sent as rows; nothing is uploaded to
 * storage, and nothing is changed until the server has validated the rows.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { csvRecords } from '@/lib/csv';

type Notice = { tone: 'success' | 'danger'; text: string } | null;

async function readRows(file: File | null, pasted: string): Promise<Array<Record<string, string | null>>> {
  const text = file ? await file.text() : pasted;
  return csvRecords(text);
}

export function ExtractionImport({ districts }: { districts: ReadonlyArray<{ id: string; label: string }> }) {
  const router = useRouter();
  const [source, setSource] = useState('');
  const [reference, setReference] = useState('');
  const [entityType, setEntityType] = useState('DENTIST');
  const [districtId, setDistrictId] = useState('');
  const [extractedAt, setExtractedAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (source.trim().length < 2) return setNotice({ tone: 'danger', text: 'Name the source (for example "IDA Raipur directory 2026").' });
    const rows = await readRows(file, pasted);
    if (rows.length === 0) return setNotice({ tone: 'danger', text: 'Choose a CSV file, or paste CSV with a header row.' });
    if (rows.length > 5000) return setNotice({ tone: 'danger', text: `That is ${rows.length} rows; import at most 5,000 at a time.` });
    setBusy(true);
    const result = await api.post<{ total: number; new: number; duplicate: number; rejected: number }>('/api/v1/admin/extraction/batches', {
      source: source.trim(),
      ...(reference.trim() ? { sourceReference: reference.trim() } : {}),
      entityType,
      countryCode: 'IN',
      ...(districtId ? { districtId } : {}),
      ...(extractedAt ? { extractedAt: new Date(extractedAt).toISOString() } : {}),
      rows,
    });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    const r = result.data;
    setNotice({ tone: 'success', text: `${r.total} rows: ${r.new} new, ${r.duplicate} duplicate, ${r.rejected} rejected. All unverified.` });
    setFile(null);
    setPasted('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Source" required hint="Where the rows came from.">
          {(props) => <Input {...props} value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} />}
        </Field>
        <Field label="Reference (optional)" hint="A URL or file name.">
          {(props) => <Input {...props} value={reference} maxLength={500} onChange={(e) => setReference(e.target.value)} />}
        </Field>
        <Field label="Extracted on (optional)">
          {(props) => <Input {...props} type="date" value={extractedAt} onChange={(e) => setExtractedAt(e.target.value)} />}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Rows are">
          {(props) => (
            <select {...props} className="tl-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="DENTIST">Dentists</option>
              <option value="CLINIC">Clinics</option>
              <option value="HOSPITAL">Hospitals</option>
              <option value="COLLEGE">Dental colleges</option>
            </select>
          )}
        </Field>
        <Field label="District" hint="Leave as “by row” when the file has a district column.">
          {(props) => (
            <select {...props} className="tl-input" value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
              <option value="">By row</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="CSV file" hint="A header row, then one row per record: name, mobile, email, registration, address, city, PIN, state, district.">
        {(props) => <input {...props} type="file" accept=".csv,text/csv" className="tl-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
      </Field>
      {!file ? (
        <Field label="…or paste CSV">
          {(props) => <textarea {...props} className="tl-input" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} />}
        </Field>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          Import rows
        </Button>
      </div>
    </form>
  );
}

export function DistrictImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const records = await readRows(file, pasted);
    const get = (row: Record<string, string | null>, ...names: string[]) => {
      const key = Object.keys(row).find((k) => names.includes(k.toLowerCase().replace(/[^a-z]/g, '')));
      return key ? row[key] : null;
    };
    const rows = records
      .map((row) => ({ state: get(row, 'state', 'statename', 'stateut') ?? '', district: get(row, 'district', 'districtname', 'districtnameinenglish') ?? '', lgdCode: get(row, 'lgdcode', 'districtcode', 'districtlgdcode') ?? undefined }))
      .filter((row) => row.state && row.district);
    if (rows.length === 0) return setNotice({ tone: 'danger', text: 'No rows with a state and a district column were found.' });
    setBusy(true);
    const result = await api.post<{ created: number; updated: number; unchanged: number; unknownStates: string[] }>('/api/v1/admin/districts', { countryCode: 'IN', rows });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    const r = result.data;
    setNotice({ tone: 'success', text: `${r.created} added, ${r.updated} updated, ${r.unchanged} unchanged.${r.unknownStates.length ? ` Unknown states skipped: ${r.unknownStates.join(', ')}.` : ''}` });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <p className="tl-muted" style={{ margin: 0 }}>
        The Local Government Directory district export (State Name, District Name, District LGD Code). Importing again is safe: a known district is updated, a new spelling is kept as an alias.
      </p>
      <Field label="CSV file">
        {(props) => <input {...props} type="file" accept=".csv,text/csv" className="tl-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
      </Field>
      {!file ? (
        <Field label="…or paste CSV">
          {(props) => <textarea {...props} className="tl-input" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />}
        </Field>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          Import districts
        </Button>
      </div>
    </form>
  );
}

export function RecordActions({ recordId, canCreate, entityType, hasContacts }: { recordId: string; canCreate: boolean; entityType: string; hasContacts: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const blocked = entityType === 'DENTIST' && !hasContacts;

  async function act(action: 'PREMADE' | 'REJECT') {
    setBusy(action);
    setNotice(null);
    const result = await api.post(`/api/v1/admin/extraction/records/${recordId}`, { action, ...(action === 'REJECT' ? { reason: reason.trim() } : {}) });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    router.refresh();
  }

  return (
    <div className="tl-stack" style={{ minWidth: '11rem' }}>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {canCreate ? (
        <Button size="sm" loading={busy === 'PREMADE'} disabled={blocked} onClick={() => act('PREMADE')} title={blocked ? 'Needs both an email address and a mobile number' : undefined}>
          {entityType === 'DENTIST' ? 'Create pre-made account' : 'Create unowned listing'}
        </Button>
      ) : null}
      {blocked && canCreate ? <span className="tl-muted">Needs email and mobile</span> : null}
      <Button size="sm" variant="ghost" aria-expanded={rejecting} onClick={() => setRejecting((v) => !v)}>
        Reject
      </Button>
      {rejecting ? (
        <div className="tl-stack">
          <Field label="Reason">
            {(props) => <Input {...props} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy === 'REJECT'} disabled={reason.trim().length < 3} onClick={() => act('REJECT')}>
            Confirm rejection
          </Button>
        </div>
      ) : null}
    </div>
  );
}
