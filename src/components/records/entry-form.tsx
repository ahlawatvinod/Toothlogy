/**
 * Add to a dental record: a treatment or visit note, or an X-ray, report or
 * other document with its file. Sent as multipart to whichever endpoint the
 * page names — the patient's own, or a practice's under the patient's grant.
 */

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';
import { ENTRY_KINDS, FILE_KINDS } from '@/platform/records/labels';

interface Props {
  readonly endpoint: string;
  readonly today: string;
  readonly dependents: ReadonlyArray<{ id: string; name: string }>;
  readonly appointments?: ReadonlyArray<{ id: string; label: string }>;
}

export function EntryForm({ endpoint, today, dependents, appointments = [] }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<string>('TREATMENT');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const needsFile = FILE_KINDS.has(kind);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api.upload<{ entryId: string }>(endpoint, new FormData(event.currentTarget));
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    formRef.current?.reset();
    setKind('TREATMENT');
    setNotice({ tone: 'success', text: 'Added to the record.' });
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="tl-form" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="What it is">
          {(props) => (
            <select {...props} name="kind" className="tl-input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {ENTRY_KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Date">{(props) => <Input {...props} name="occurredOn" type="date" defaultValue={today} max={today} />}</Field>
        {dependents.length > 0 ? (
          <Field label="For">
            {(props) => (
              <select {...props} name="dependentId" className="tl-input" defaultValue="">
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
      </div>
      <Field label="Title">{(props) => <Input {...props} name="title" maxLength={160} />}</Field>
      <Field label="Teeth (optional)" hint="FDI numbers, e.g. 16, 26 — milk teeth 51–85.">
        {(props) => <Input {...props} name="teeth" maxLength={160} inputMode="numeric" />}
      </Field>
      <Field label={needsFile ? 'Notes (optional)' : 'Notes'}>{(props) => <textarea {...props} name="notes" className="tl-input" rows={3} maxLength={4000} />}</Field>
      {appointments.length > 0 ? (
        <Field label="Visit (optional)">
          {(props) => (
            <select {...props} name="appointmentId" className="tl-input" defaultValue="">
              <option value="">Not tied to a visit</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
      <Field label={needsFile ? 'File' : 'File (optional)'} hint="PDF, JPEG, PNG, WebP, TIFF or DICOM. Private to the patient and whoever they share their record with.">
        {(props) => <input {...props} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff,.dcm" />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Add to record
        </Button>
      </div>
    </form>
  );
}
