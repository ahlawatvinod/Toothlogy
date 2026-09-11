/** Reply to a review (or change the reply), or flag it for a moderator. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function ReviewReply({ reviewId, reply, flagged }: { reviewId: string; reply: string; flagged: boolean }) {
  const router = useRouter();
  const [panel, setPanel] = useState<'reply' | 'flag' | null>(null);
  const [text, setText] = useState(reply);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function send(url: string, body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(url, body);
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" aria-expanded={panel === 'reply'} onClick={() => setPanel(panel === 'reply' ? null : 'reply')}>
          {reply ? 'Change reply' : 'Reply'}
        </Button>
        {!flagged ? (
          <Button size="sm" variant="ghost" aria-expanded={panel === 'flag'} onClick={() => setPanel(panel === 'flag' ? null : 'flag')}>
            Flag for a moderator
          </Button>
        ) : null}
      </div>
      {panel === 'reply' ? (
        <div className="tl-stack">
          <Field label="Public reply" hint="Thank the patient or explain — never share their details.">
            {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div>
            <Button size="sm" loading={busy} disabled={text.trim().length < 10} onClick={() => send(`/api/v1/reviews/${reviewId}/response`, { body: text.trim() }, 'Reply published.')}>
              Publish reply
            </Button>
          </div>
        </div>
      ) : null}
      {panel === 'flag' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="What is wrong with it?">
            {(props) => <Input {...props} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy} disabled={reason.trim().length < 10} onClick={() => send(`/api/v1/reviews/${reviewId}/flag`, { reason: reason.trim() }, 'Flagged. A moderator will look at it; it stays up meanwhile.')}>
            Send to a moderator
          </Button>
        </div>
      ) : null}
    </div>
  );
}
