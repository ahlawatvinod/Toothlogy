/** Rate a visit that took place: stars and, optionally, a few words. */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field } from '@/design-system';
import { api } from '@/lib/api-client';
import { StarInput } from '@/components/reviews/star-input';

export function ReviewForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating < 1) return setError('Choose from 1 to 5 stars.');
    setBusy(true);
    const result = await api.post(`/api/v1/appointments/${appointmentId}/review`, { rating, ...(body.trim() ? { body: body.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <Alert tone="success" title="Thank you">
        Your review is published under your first name and initial. You can change it for 30 days from <Link href="/account/reviews">My reviews</Link>.
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <StarInput name={`rating-${appointmentId}`} value={rating} onChange={setRating} />
      <Field label="What was it like? (optional)" hint="Shown publicly. No phone numbers or email addresses.">
        {(props) => <textarea {...props} className="tl-input" rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Publish review
        </Button>
      </div>
    </form>
  );
}
