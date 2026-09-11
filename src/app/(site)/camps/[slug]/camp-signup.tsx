/**
 * Register for a camp (patients), or apply to serve at it (verified
 * dentists). Consent covers the camp's organizer and doctors only.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function RegisterForCamp({ campId, defaultPhone }: { campId: string; defaultPhone: string }) {
  const [phone, setPhone] = useState(defaultPhone.replace(/^\+91/, ''));
  const [age, setAge] = useState('');
  const [concern, setConcern] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!consent) return setError('Agree to share your details with the camp’s organizer and doctors to register.');
    const ageNumber = age.trim() ? Number(age) : undefined;
    if (ageNumber !== undefined && (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120)) return setError('Enter the age in years, or leave it empty.');
    setBusy(true);
    const result = await api.post(`/api/v1/camps/${campId}/registrations`, { consentToShare: true, phone, ...(ageNumber !== undefined ? { age: ageNumber } : {}), ...(concern.trim() ? { concern: concern.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setDone(true);
  }

  if (done) {
    return (
      <Alert tone="success" title="You are registered">
        Bring this confirmation or your phone number to the venue. See it under <Link href="/account/camps">My camps</Link>.
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Mobile number" required hint="The camp uses it to find your registration.">
        {(props) => <Input {...props} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Age (optional)">
          {(props) => <Input {...props} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />}
        </Field>
      </div>
      <Field label="What would you like checked? (optional)">
        {(props) => <Input {...props} maxLength={500} value={concern} onChange={(e) => setConcern(e.target.value)} />}
      </Field>
      <label className="tl-checkbox">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>The camp’s organizer and dentists may see my name, phone number and what they find, to look after me at the camp and afterwards.</span>
      </label>
      <div>
        <Button type="submit" loading={busy}>
          Register
        </Button>
      </div>
    </form>
  );
}

export function ApplyAsDoctor({ campId }: { campId: string }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await api.post(`/api/v1/camps/${campId}/doctors`, message.trim() ? { message: message.trim() } : {});
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setDone(true);
  }

  if (done) {
    return (
      <Alert tone="success" title="Application sent">
        The organizer will confirm you. Follow it under <Link href="/account/camps">My camps</Link>.
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Message to the organizer (optional)">
        {(props) => <Input {...props} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Apply to serve at this camp
        </Button>
      </div>
    </form>
  );
}
