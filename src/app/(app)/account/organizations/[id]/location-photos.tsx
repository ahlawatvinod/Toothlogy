/**
 * A branch's photos, shown on the public clinic page: up to twelve, uploaded
 * as the organization (CLINIC_PHOTO, public), removed individually. The list
 * is saved with each change; a photo held for a security scan is not added.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field } from '@/design-system';
import { api } from '@/lib/api-client';

const MAX = 12;

export function LocationPhotos({
  organizationId,
  locationId,
  locationName,
  photoFileIds,
}: {
  organizationId: string;
  locationId: string;
  locationName: string;
  photoFileIds: readonly string[];
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState<string[]>([...photoFileIds]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);

  async function save(next: string[], message: string) {
    const result = await api.patch(`/api/v1/organizations/${organizationId}/locations/${locationId}`, { photoFileIds: next });
    if (!result.ok) {
      setNotice({ tone: 'danger', text: result.message });
      return false;
    }
    setPhotos(next);
    setNotice({ tone: 'success', text: message });
    router.refresh();
    return true;
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setNotice(null);
    const added: string[] = [];
    for (const file of Array.from(files).slice(0, MAX - photos.length)) {
      const body = new FormData();
      body.append('file', file);
      body.append('purpose', 'CLINIC_PHOTO');
      body.append('organizationId', organizationId);
      const uploaded = await api.upload<{ id: string; status: string }>('/api/v1/files', body);
      if (!uploaded.ok) {
        setNotice({ tone: 'danger', text: `${file.name}: ${uploaded.message}` });
        continue;
      }
      if (uploaded.data.status !== 'ACTIVE') {
        setNotice({ tone: 'warning', text: `${file.name} is held for a security scan and was not added.` });
        continue;
      }
      added.push(uploaded.data.id);
    }
    if (added.length > 0) await save([...photos, ...added], `${added.length === 1 ? 'Photo' : `${added.length} photos`} added.`);
    setBusy(false);
  }

  async function remove(photoId: string) {
    setBusy(true);
    await save(photos.filter((p) => p !== photoId), 'Photo removed.');
    setBusy(false);
  }

  return (
    <section className="tl-stack" aria-label={`Photos of ${locationName}`}>
      <strong>Photos</strong>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      {photos.length > 0 ? (
        <ul className="tl-inline" style={{ flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
          {photos.map((photoId, index) => (
            <li key={photoId} className="tl-stack" style={{ alignItems: 'flex-start' }}>
              {/* A public file streamed by the files API. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/files/${photoId}/public`} alt={`${locationName}, photo ${index + 1}`} width={120} height={90} style={{ objectFit: 'cover', borderRadius: 'var(--tl-radius-md, 8px)' }} />
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(photoId)}>
                Remove photo {index + 1}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tl-muted" style={{ margin: 0 }}>No photos yet. Patients see them on your public clinic page.</p>
      )}
      {photos.length < MAX ? (
        <Field label={`Add photos of ${locationName}`} hint={`JPEG, PNG or WebP, up to 10 MB each; ${MAX - photos.length} more allowed.`}>
          {(p) => (
            <input
              {...p}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="tl-input"
              disabled={busy}
              onChange={(e) => {
                void upload(e.target.files);
                e.target.value = '';
              }}
            />
          )}
        </Field>
      ) : null}
    </section>
  );
}
