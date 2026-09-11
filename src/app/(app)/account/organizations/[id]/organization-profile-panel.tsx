/**
 * The organization's public profile: name, description, website, phone,
 * email, tax identifier and logo, as shown on its public page.
 *
 * Only changed fields are sent. Changing the tax identifier of a verified
 * organization drops its verification (the badge certified the old number);
 * the server says so and the panel shows it rather than a plain "saved".
 */

'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export interface OrganizationProfile {
  readonly name: string;
  readonly description: string | null;
  readonly website: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly taxIdentifier: string | null;
  readonly logoFileId: string | null;
  readonly verified: boolean;
}

type Notice = { tone: 'success' | 'warning' | 'danger' | 'info'; text: string };
type Editable = 'name' | 'description' | 'website' | 'phone' | 'email' | 'taxIdentifier';

const orNull = (value: string) => (value.trim() ? value.trim() : null);

export function OrganizationProfilePanel({ organizationId, profile }: { organizationId: string; profile: OrganizationProfile }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<Editable, string>>({
    name: profile.name,
    description: profile.description ?? '',
    website: profile.website ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    taxIdentifier: profile.taxIdentifier ?? '',
  });
  const [logoFileId, setLogoFileId] = useState(profile.logoFileId);
  const [busy, setBusy] = useState<'save' | 'logo' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const set = (key: Editable) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function uploadLogo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy('logo');
    setNotice(null);
    const body = new FormData();
    body.append('file', file);
    body.append('purpose', 'ORGANIZATION_LOGO');
    body.append('organizationId', organizationId);
    const uploaded = await api.upload<{ id: string; status: string }>('/api/v1/files', body);
    if (!uploaded.ok) {
      setBusy(null);
      return setNotice({ tone: 'danger', text: uploaded.message });
    }
    if (uploaded.data.status !== 'ACTIVE') {
      setBusy(null);
      return setNotice({ tone: 'warning', text: 'The logo is held for a security scan and cannot be used yet.' });
    }
    const saved = await api.patch(`/api/v1/organizations/${organizationId}`, { logoFileId: uploaded.data.id });
    setBusy(null);
    if (!saved.ok) return setNotice({ tone: 'danger', text: saved.message });
    setLogoFileId(uploaded.data.id);
    setNotice({ tone: 'success', text: 'Logo saved. It appears on your public page.' });
    router.refresh();
  }

  async function removeLogo() {
    setBusy('logo');
    const saved = await api.patch(`/api/v1/organizations/${organizationId}`, { logoFileId: null });
    setBusy(null);
    if (!saved.ok) return setNotice({ tone: 'danger', text: saved.message });
    setLogoFileId(null);
    setNotice({ tone: 'success', text: 'Logo removed.' });
    router.refresh();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const next: Record<Editable, string | null> = {
      name: form.name.trim(),
      description: orNull(form.description),
      website: orNull(form.website),
      phone: orNull(form.phone),
      email: orNull(form.email),
      taxIdentifier: orNull(form.taxIdentifier),
    };
    const changes = Object.fromEntries((Object.keys(next) as Editable[]).filter((k) => next[k] !== profile[k]).map((k) => [k, next[k]]));
    if (Object.keys(changes).length === 0) return setNotice({ tone: 'info', text: 'Nothing has changed.' });
    setBusy('save');
    setNotice(null);
    const result = await api.patch<{ verificationCleared: boolean; warning?: string }>(`/api/v1/organizations/${organizationId}`, changes);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice(
      result.data.verificationCleared
        ? { tone: 'warning', text: result.data.warning ?? 'Saved. The organization must be verified again.' }
        : { tone: 'success', text: 'Saved.' },
    );
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {logoFileId ? (
          // A public file streamed by the files API; not a static asset next/image could optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/files/${logoFileId}/public`} alt="Your logo" width={72} height={72} style={{ objectFit: 'contain', borderRadius: 'var(--tl-radius-md, 8px)' }} />
        ) : (
          <span className="tl-muted">No logo yet.</span>
        )}
        <Field label="Logo" hint="JPEG, PNG or WebP, up to 5 MB.">
          {(p) => (
            <input
              {...p}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="tl-input"
              disabled={busy !== null}
              onChange={(e) => {
                void uploadLogo(e.target.files);
                e.target.value = '';
              }}
            />
          )}
        </Field>
        {logoFileId ? (
          <Button size="sm" variant="ghost" loading={busy === 'logo'} onClick={removeLogo}>
            Remove logo
          </Button>
        ) : null}
      </div>

      <form className="tl-form" onSubmit={save} noValidate>
        <Field label="Name" required>
          {(p) => <Input {...p} value={form.name} maxLength={200} onChange={set('name')} />}
        </Field>
        <Field label="About the organization" hint="Shown on your public page. Plain text.">
          {(p) => <textarea {...p} className="tl-input" rows={4} maxLength={4000} value={form.description} onChange={set('description')} />}
        </Field>
        <Field label="Website" hint="A full address, e.g. https://example.in">
          {(p) => <Input {...p} type="url" value={form.website} maxLength={300} onChange={set('website')} />}
        </Field>
        <Field label="Phone" hint="International format, e.g. +919876543210.">
          {(p) => <Input {...p} type="tel" value={form.phone} onChange={set('phone')} />}
        </Field>
        <Field label="Email">
          {(p) => <Input {...p} type="email" value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Tax identifier (GSTIN)" hint={profile.verified ? 'Changing it means the organization must be verified again.' : 'Optional.'}>
          {(p) => <Input {...p} value={form.taxIdentifier} maxLength={40} onChange={set('taxIdentifier')} />}
        </Field>
        <div>
          <Button type="submit" loading={busy === 'save'} disabled={busy === 'logo'}>
            Save profile
          </Button>
        </div>
      </form>
    </div>
  );
}
