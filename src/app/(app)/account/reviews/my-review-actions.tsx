/** Change one's review (within the window) or remove it. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field } from '@/design-system';
import { api } from '@/lib/api-client';
import { StarInput } from '@/components/reviews/star-input';

export function MyReviewActions({ reviewId, rating, body, canEdit }: { reviewId: string; rating: number; body: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [stars, setStars] = useState(rating);
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const result = await api.patch(`/api/v1/reviews/${reviewId}`, { rating: stars, ...(text.trim() ? { body: text.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setEditing(false);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    setError(null);
    const result = await api.delete(`/api/v1/reviews/${reviewId}`);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {canEdit ? (
          <Button size="sm" variant="secondary" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            Change
          </Button>
        ) : null}
        {confirming ? (
          <>
            <Button size="sm" variant="danger" loading={busy} onClick={remove}>
              Remove review
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
      </div>
      {editing ? (
        <div className="tl-stack">
          <StarInput name={`edit-${reviewId}`} value={stars} onChange={setStars} />
          <Field label="Your review">
            {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" loading={busy} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
