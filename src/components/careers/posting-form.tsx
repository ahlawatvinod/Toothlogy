/**
 * Post or edit a job or internship. Pay is optional and stated in whole rupees
 * a month; choosing "Internship" sets the employment type to match.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';
import { EMPLOYMENT_TYPES, JOB_KINDS, JOB_ROLES } from '@/platform/careers/labels';

export interface PostingValues {
  readonly kind: string;
  readonly role: string;
  readonly employmentType: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: string;
  readonly specialtyKey: string;
  readonly districtId: string;
  readonly city: string;
  readonly payMin: string;
  readonly payMax: string;
  readonly openings: string;
  readonly closesOn: string;
}

interface Props {
  readonly organizationId: string;
  readonly postingId?: string;
  readonly initial: PostingValues;
  readonly districts: ReadonlyArray<{ id: string; label: string }>;
  readonly specialties: ReadonlyArray<{ key: string; name: string }>;
  readonly today: string;
}

export function PostingForm({ organizationId, postingId, initial, districts, specialties, today }: Props) {
  const router = useRouter();
  const [v, setV] = useState<PostingValues>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [key] = useState(() => newIdempotencyKey());
  const set = (field: keyof PostingValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [field]: e.target.value }));

  function body() {
    const num = (s: string) => (s.trim() ? Number(s.replace(/[,\s]/g, '')) : undefined);
    return {
      kind: v.kind,
      role: v.role,
      employmentType: v.employmentType,
      title: v.title.trim(),
      description: v.description.trim(),
      ...(v.requirements.trim() || postingId ? { requirements: v.requirements.trim() } : {}),
      ...(v.specialtyKey || postingId ? { specialtyKey: v.specialtyKey } : {}),
      ...(v.districtId || postingId ? { districtId: v.districtId } : {}),
      ...(v.city.trim() || postingId ? { city: v.city.trim() } : {}),
      ...(num(v.payMin) !== undefined ? { payMin: num(v.payMin) } : {}),
      ...(num(v.payMax) !== undefined ? { payMax: num(v.payMax) } : {}),
      ...(num(v.openings) !== undefined ? { openings: num(v.openings) } : {}),
      ...(v.closesOn ? { closesOn: v.closesOn } : {}),
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    if (postingId) {
      const result = await api.patch(`/api/v1/postings/${postingId}`, body());
      setBusy(false);
      if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
      setNotice({ tone: 'success', text: 'Saved.' });
      return router.refresh();
    }
    const result = await api.post<{ postingId: string }>(`/api/v1/organizations/${organizationId}/postings`, body(), { idempotencyKey: key });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    router.push(`/account/organizations/${organizationId}/careers/${result.data.postingId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Kind">
          {(props) => (
            <select
              {...props}
              className="tl-input"
              value={v.kind}
              onChange={(e) => setV((x) => ({ ...x, kind: e.target.value, employmentType: e.target.value === 'INTERNSHIP' ? 'INTERNSHIP' : x.employmentType === 'INTERNSHIP' ? 'FULL_TIME' : x.employmentType }))}
            >
              {JOB_KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Role">
          {(props) => (
            <select {...props} className="tl-input" value={v.role} onChange={set('role')}>
              {JOB_ROLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Employment type">
          {(props) => (
            <select {...props} className="tl-input" value={v.employmentType} onChange={set('employmentType')}>
              {EMPLOYMENT_TYPES.filter(([value]) => (v.kind === 'INTERNSHIP' ? value === 'INTERNSHIP' : value !== 'INTERNSHIP')).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label="Job title">{(props) => <Input {...props} maxLength={120} value={v.title} onChange={set('title')} />}</Field>
      <Field label="About the role" hint="What the work is, the hours, who it suits. No phone numbers, emails or links — people apply through Toothlogy.">
        {(props) => <textarea {...props} className="tl-input" rows={8} maxLength={8000} value={v.description} onChange={set('description')} />}
      </Field>
      <Field label="Requirements (optional)">{(props) => <textarea {...props} className="tl-input" rows={4} maxLength={3000} value={v.requirements} onChange={set('requirements')} />}</Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="District (optional)">
          {(props) => (
            <select {...props} className="tl-input" value={v.districtId} onChange={set('districtId')}>
              <option value="">Not stated</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Town or city (optional)">{(props) => <Input {...props} maxLength={80} value={v.city} onChange={set('city')} />}</Field>
        <Field label="Specialty (optional)">
          {(props) => (
            <select {...props} className="tl-input" value={v.specialtyKey} onChange={set('specialtyKey')}>
              <option value="">Any</option>
              {specialties.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label={v.kind === 'INTERNSHIP' ? 'Stipend from (₹ a month, optional)' : 'Pay from (₹ a month, optional)'}>{(props) => <Input {...props} inputMode="numeric" value={v.payMin} onChange={set('payMin')} />}</Field>
        <Field label="Up to (₹ a month, optional)">{(props) => <Input {...props} inputMode="numeric" value={v.payMax} onChange={set('payMax')} />}</Field>
        <Field label="Openings">{(props) => <Input {...props} inputMode="numeric" value={v.openings} onChange={set('openings')} />}</Field>
        <Field label="Closing date (optional)">{(props) => <Input {...props} type="date" min={today} value={v.closesOn} onChange={set('closesOn')} />}</Field>
      </div>
      <div>
        <Button type="submit" loading={busy}>
          {postingId ? 'Save changes' : 'Save as draft'}
        </Button>
      </div>
    </form>
  );
}
