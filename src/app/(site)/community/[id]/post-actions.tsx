/**
 * Answering, and what can be done to a post: accept (the asker), remove
 * (the author), report (anyone else), hide or restore (moderators).
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

const REASONS = [
  ['SPAM', 'Spam or advertising'],
  ['ABUSE', 'Abusive'],
  ['MISINFORMATION', 'Wrong or dangerous health information'],
  ['PRIVACY', 'Shares someone’s private details'],
  ['OTHER', 'Something else'],
] as const;

export function AnswerForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (body.trim().length < 10) return setError('Write at least 10 characters.');
    setBusy(true);
    const result = await api.post(`/api/v1/community/questions/${questionId}/answers`, { body: body.trim() }, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setBody('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Answer" hint="Say what you know and how you know it. No phone numbers or email addresses.">
        {(props) => <textarea {...props} className="tl-input" rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Post answer
        </Button>
      </div>
    </form>
  );
}

export function PostActions({
  targetType,
  targetId,
  mine,
  moderator,
  hidden,
  accept,
}: {
  targetType: 'QUESTION' | 'ANSWER';
  targetId: string;
  mine: boolean;
  moderator: boolean;
  hidden: boolean;
  accept?: { questionId: string; accepted: boolean };
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<'report' | 'hide' | null>(null);
  const [reason, setReason] = useState('SPAM');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function send(key: string, url: string, body: Record<string, unknown>, done: string, after?: () => void) {
    setBusy(key);
    setNotice(null);
    const result = await api.post(url, body);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    after?.();
    router.refresh();
  }
  const target = { targetType, targetId };

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {accept ? (
          <Button size="sm" variant={accept.accepted ? 'ghost' : 'secondary'} loading={busy === 'accept'} onClick={() => send('accept', `/api/v1/community/questions/${accept.questionId}/accept`, { answerId: accept.accepted ? null : targetId }, accept.accepted ? 'Cleared.' : 'Marked as the answer that helped.')}>
            {accept.accepted ? 'Unmark' : 'This helped'}
          </Button>
        ) : null}
        {mine ? (
          <Button size="sm" variant="ghost" loading={busy === 'remove'} onClick={() => send('remove', '/api/v1/community/posts/remove', target, 'Removed.', targetType === 'QUESTION' ? () => router.push('/community') : undefined)}>
            Remove
          </Button>
        ) : (
          <Button size="sm" variant="ghost" aria-expanded={panel === 'report'} onClick={() => setPanel(panel === 'report' ? null : 'report')}>
            Report
          </Button>
        )}
        {moderator ? (
          hidden ? (
            <Button size="sm" variant="secondary" loading={busy === 'restore'} onClick={() => send('restore', '/api/v1/admin/community/moderate', { ...target, action: 'RESTORE' }, 'Restored.')}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="ghost" aria-expanded={panel === 'hide'} onClick={() => setPanel(panel === 'hide' ? null : 'hide')}>
              Hide
            </Button>
          )
        ) : null}
      </div>
      {panel === 'report' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="What is wrong?">
            {(props) => (
              <select {...props} className="tl-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={reason === 'OTHER' ? 'Details' : 'Details (optional)'}>
            {(props) => <Input {...props} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy === 'report'} onClick={() => send('report', '/api/v1/community/reports', { ...target, reason, ...(note.trim() ? { note: note.trim() } : {}) }, 'Reported. Thank you — a moderator will look at it.')}>
            Send report
          </Button>
        </div>
      ) : null}
      {panel === 'hide' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Reason the author will see">
            {(props) => <Input {...props} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy === 'hide'} disabled={note.trim().length < 3} onClick={() => send('hide', '/api/v1/admin/community/moderate', { ...target, action: 'HIDE', reason: note.trim() }, 'Hidden. The author has been told why.')}>
            Hide post
          </Button>
        </div>
      ) : null}
    </div>
  );
}
