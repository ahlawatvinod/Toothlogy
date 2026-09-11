/** Reply in a conversation, or close it. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function ThreadComposer({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length < 2) return setError('Write a message.');
    setBusy('send');
    setError(null);
    const result = await api.post(`/api/v1/messages/threads/${threadId}`, { body: body.trim() }, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setBody('');
    router.refresh();
  }
  async function close() {
    setBusy('close');
    setError(null);
    const result = await api.post(`/api/v1/messages/threads/${threadId}/close`, {});
    setBusy(null);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <Card label="Reply">
      <CardBody>
        <form onSubmit={send} className="tl-form" noValidate>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="Your message">
            {(props) => <textarea {...props} className="tl-input" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            <Button type="submit" loading={busy === 'send'}>
              Send
            </Button>
            <Button type="button" variant="ghost" loading={busy === 'close'} onClick={close}>
              Close conversation
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
