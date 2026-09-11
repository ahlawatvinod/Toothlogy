/**
 * The claim itself: the claimant's role, documents they upload as themselves
 * (registration certificate, licence, identity), and a note. Nothing says
 * "submitted" unless the server created the verification request.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Badge, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

const KINDS = [
  { purpose: 'CERTIFICATE', label: 'Clinic registration certificate' },
  { purpose: 'DENTIST_LICENSE', label: 'Dentist licence' },
  { purpose: 'IDENTITY_DOCUMENT', label: 'Identity document' },
  { purpose: 'AGREEMENT', label: 'Lease or partnership agreement' },
  { purpose: 'OTHER', label: 'Other' },
] as const;

interface Attached {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly usable: boolean;
}

export function ClaimForm({ organizationId, clinicSlug }: { organizationId: string; clinicSlug: string }) {
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<(typeof KINDS)[number]['purpose']>('CERTIFICATE');
  const [attached, setAttached] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const label = KINDS.find((k) => k.purpose === kind)?.label ?? kind;
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('file', file);
      body.append('purpose', kind);
      const result = await api.upload<{ id: string; status: string }>('/api/v1/files', body);
      if (!result.ok) {
        setError(`${file.name}: ${result.message}`);
        continue;
      }
      setAttached((prev) => [...prev, { id: result.data.id, name: file.name, kind: label, usable: result.data.status === 'ACTIVE' }]);
    }
    setUploading(false);
  }

  async function submit() {
    setError(null);
    if (role.trim().length < 2) return setError('Say what your role at the clinic is.');
    const usable = attached.filter((a) => a.usable);
    if (usable.length === 0) return setError('Attach at least one document that has finished uploading.');
    setSubmitting(true);
    const result = await api.post<{ message: string }>(`/api/v1/organizations/${organizationId}/claim`, {
      role: role.trim(),
      documentFileIds: usable.map((a) => a.id),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setSubmitting(false);
    if (!result.ok) return setError(result.message);
    setDone(result.data.message);
  }

  if (done) {
    return (
      <Alert tone="success" title="Claim submitted">
        {done} <Link href={`/clinics/${clinicSlug}`}>Back to the clinic page</Link>
      </Alert>
    );
  }

  return (
    <div className="tl-form">
      {error ? (
        <Alert tone="danger" title="Not submitted">
          {error}
        </Alert>
      ) : null}

      <Field label="Your role at the clinic" required hint="For example: owner, managing partner, practice manager.">
        {(p) => <Input {...p} value={role} maxLength={120} onChange={(e) => setRole(e.target.value)} />}
      </Field>

      <Field label="Document type">
        {(p) => (
          <select {...p} className="tl-input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((k) => (
              <option key={k.purpose} value={k.purpose}>
                {k.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Documents" required hint="PDF, JPEG or PNG. Choose the type above, then the file; repeat for each document.">
        {(p) => (
          <input
            {...p}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="tl-input"
            disabled={uploading}
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
        )}
      </Field>

      {attached.length > 0 ? (
        <ul className="tl-list" aria-label="Attached documents">
          {attached.map((a) => (
            <li key={a.id}>
              <div className="tl-card__title-row">
                <span>
                  {a.name} · {a.kind}
                </span>
                {a.usable ? <Badge tone="success">Uploaded</Badge> : <Badge tone="warning">Held for a security scan — cannot be used yet</Badge>}
                <Button size="sm" variant="ghost" onClick={() => setAttached((prev) => prev.filter((x) => x.id !== a.id))}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Field label="Note for the reviewer" hint="Optional.">
        {(p) => <Input {...p} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
      </Field>

      <div>
        <Button onClick={submit} loading={submitting} disabled={uploading}>
          Submit claim
        </Button>
      </div>
    </div>
  );
}
