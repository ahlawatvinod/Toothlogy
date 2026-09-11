/**
 * Submit the organization for verification.
 *
 * Two real steps, both visible: the registration number is saved to the
 * organization, then documents are uploaded AS the organization and submitted.
 * If the server finds anything missing it names every item at once, and that
 * message is shown as-is — no "submitted!" unless a request was created.
 *
 * An upload that is held for a malware scan is not yet usable evidence; the
 * panel says so rather than letting the submission fail mysteriously.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

interface UploadedFile {
  id: string;
  status: string;
  scanStatus: string;
}

interface Attached {
  readonly id: string;
  readonly name: string;
  readonly usable: boolean;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';

export function VerificationPanel({
  organizationId,
  registrationNumber,
}: {
  organizationId: string;
  registrationNumber: string | null;
}) {
  const router = useRouter();
  const [registration, setRegistration] = useState(registrationNumber ?? '');
  const [note, setNote] = useState('');
  const [attached, setAttached] = useState<Attached[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'CERTIFICATE');
      form.append('organizationId', organizationId);
      const result = await api.upload<UploadedFile>('/api/v1/files', form);
      if (!result.ok) {
        setError(`${file.name}: ${result.message}`);
        continue;
      }
      setAttached((prev) => [...prev, { id: result.data.id, name: file.name, usable: result.data.status === 'ACTIVE' }]);
    }
    setUploading(false);
  }

  async function submit() {
    setError(null);
    const trimmed = registration.trim();
    if (!trimmed) return setError('Enter the registration number shown on your certificate.');
    const usable = attached.filter((a) => a.usable);
    if (usable.length === 0) return setError('Attach at least one document that has finished uploading.');

    setSubmitting(true);
    if (trimmed !== (registrationNumber ?? '')) {
      const saved = await api.patch(`/api/v1/organizations/${organizationId}`, { registrationNumber: trimmed });
      if (!saved.ok) {
        setSubmitting(false);
        return setError(saved.message);
      }
    }
    const result = await api.post<{ message: string }>(`/api/v1/organizations/${organizationId}/verification`, {
      documentFileIds: usable.map((a) => a.id),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setSubmitting(false);
    if (!result.ok) return setError(result.message);
    setDone(result.data.message);
    router.refresh();
  }

  if (done) {
    return (
      <Alert tone="success" title="Submitted for verification">
        {done}
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

      <Field label="Registration number" required hint="As printed on your clinic registration or establishment certificate.">
        {(props) => <Input {...props} value={registration} maxLength={80} onChange={(e) => setRegistration(e.target.value)} />}
      </Field>

      <Field label="Documents" required hint="PDF, JPEG or PNG. Registration certificate first; add licences if you have them.">
        {(props) => (
          <input
            {...props}
            type="file"
            accept={ACCEPT}
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
                <span>{a.name}</span>
                {a.usable ? (
                  <Badge tone="success">Uploaded</Badge>
                ) : (
                  <Badge tone="warning">Held for a security scan — cannot be used yet</Badge>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAttached((prev) => prev.filter((p) => p.id !== a.id))}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Field label="Note for the reviewer" hint="Optional.">
        {(props) => <Input {...props} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}
      </Field>

      <Button onClick={submit} loading={submitting} disabled={uploading}>
        Submit for verification
      </Button>
    </div>
  );
}
