/** A reviewer's decision: publish, or request changes with a note; or archive. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function ReviewForm({ articleId, canReview, canArchive }: { articleId: string; canReview: boolean; canArchive: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'PUBLISH' | 'REQUEST_CHANGES') {
    setBusy(decision);
    setError(null);
    const result = await api.post(`/api/v1/admin/articles/${articleId}/review`, { decision, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.push('/admin/knowledge');
    router.refresh();
  }

  async function archive(event: React.FormEvent) {
    event.preventDefault();
    setBusy('archive');
    setError(null);
    const result = await api.post(`/api/v1/articles/${articleId}/archive`, { reason: reason.trim() });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {canReview ? (
        <>
          <Field label="Note to the author" hint="Required when asking for changes; optional when publishing.">
            {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            <Button type="button" loading={busy === 'PUBLISH'} onClick={() => decide('PUBLISH')}>
              Publish
            </Button>
            <Button type="button" variant="secondary" loading={busy === 'REQUEST_CHANGES'} onClick={() => decide('REQUEST_CHANGES')}>
              Request changes
            </Button>
          </div>
        </>
      ) : null}
      {canArchive ? (
        <form onSubmit={archive} className="tl-form" noValidate>
          <Field label="Archive — reason the author is told">{(props) => <Input {...props} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div>
            <Button type="submit" variant="ghost" loading={busy === 'archive'} disabled={reason.trim().length < 5}>
              Take it off Toothlogy
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
