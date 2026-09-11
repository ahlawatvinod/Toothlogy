/**
 * The camp planning form. Times are entered as India time and sent with
 * their offset, so a camp at 9 am is 9 am wherever the organizer's browser is.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

const ist = (local: string) => `${local}:00+05:30`;

export function CampForm({ districts, organizations }: { districts: ReadonlyArray<{ id: string; label: string }>; organizations: ReadonlyArray<{ id: string; name: string }> }) {
  const router = useRouter();
  const [values, setValues] = useState({ title: '', districtId: districts[0]?.id ?? '', organizationId: '', venueName: '', venueAddress: '', startsAt: '', endsAt: '', capacity: '', services: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.startsAt || !values.endsAt) return setError('Choose when the camp starts and ends.');
    const capacity = values.capacity.trim() ? Number(values.capacity) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) return setError('Enter the number of places, or leave it empty.');
    setBusy(true);
    const result = await api.post<{ campId: string }>(
      '/api/v1/camps',
      {
        title: values.title.trim(),
        districtId: values.districtId,
        organizationId: values.organizationId || null,
        venueName: values.venueName.trim(),
        venueAddress: values.venueAddress.trim(),
        startsAt: ist(values.startsAt),
        endsAt: ist(values.endsAt),
        capacity,
        services: values.services.trim() || null,
        description: values.description.trim() || null,
      },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push(`/account/camps/${result.data.campId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Title" required hint="For example “Free dental check-up, Govt. School Tatibandh”.">
        {(props) => <Input {...props} maxLength={160} value={values.title} onChange={set('title')} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="District" required>
          {(props) => (
            <select {...props} className="tl-input" value={values.districtId} onChange={set('districtId')}>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {organizations.length > 0 ? (
          <Field label="Run for (optional)">
            {(props) => (
              <select {...props} className="tl-input" value={values.organizationId} onChange={set('organizationId')}>
                <option value="">Myself</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      <Field label="Venue" required>
        {(props) => <Input {...props} maxLength={160} value={values.venueName} onChange={set('venueName')} />}
      </Field>
      <Field label="Venue address" required>
        {(props) => <Input {...props} maxLength={400} value={values.venueAddress} onChange={set('venueAddress')} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Starts (India time)" required>
          {(props) => <Input {...props} type="datetime-local" value={values.startsAt} onChange={set('startsAt')} />}
        </Field>
        <Field label="Ends (India time)" required>
          {(props) => <Input {...props} type="datetime-local" value={values.endsAt} onChange={set('endsAt')} />}
        </Field>
        <Field label="Places (optional)">
          {(props) => <Input {...props} inputMode="numeric" value={values.capacity} onChange={set('capacity')} />}
        </Field>
      </div>
      <Field label="Offered (optional)" hint="For example “Check-up, cleaning advice, fluoride varnish for children”.">
        {(props) => <Input {...props} maxLength={500} value={values.services} onChange={set('services')} />}
      </Field>
      <Field label="About the camp (optional)">
        {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={4000} value={values.description} onChange={set('description')} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Save draft
        </Button>
      </div>
    </form>
  );
}
