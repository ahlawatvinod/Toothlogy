/** Apply for a posting: résumé, a note, and consent to share contact details. */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field } from '@/design-system';
import { api } from '@/lib/api-client';

export function ApplyForm({ postingId, employer }: { postingId: string; employer: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('consent') !== 'on') return setError(`Agree to share your contact details with ${employer}.`);
    setBusy(true);
    setError(null);
    const result = await api.upload(`/api/v1/careers/${postingId}/applications`, form);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <Alert tone="success">
        Applied. {employer} will see your application; follow it under <Link href="/account/applications">My applications</Link>.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Résumé (PDF or Word, optional)" hint="Up to 10 MB. Only this employer sees it, and only while your application stands.">
        {(props) => <input {...props} name="file" type="file" accept=".pdf,.docx" />}
      </Field>
      <Field label="A note to the employer (optional)">{(props) => <textarea {...props} name="coverNote" className="tl-input" rows={4} maxLength={3000} />}</Field>
      <label className="tl-checkbox">
        <input type="checkbox" name="consent" />
        <span>Share my name, email and phone number with {employer} for this application</span>
      </label>
      <div>
        <Button type="submit" loading={busy}>
          Apply
        </Button>
      </div>
    </form>
  );
}
