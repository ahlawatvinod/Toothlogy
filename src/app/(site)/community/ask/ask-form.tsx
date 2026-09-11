/** The question form; on success, go to the new question. */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function AskForm({ topics }: { topics: ReadonlyArray<{ key: string; label: string }> }) {
  const router = useRouter();
  const [topic, setTopic] = useState(topics[0]?.key ?? 'general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newIdempotencyKey());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (title.trim().length < 10) return setError('Ask your question in at least 10 characters.');
    if (body.trim().length < 20) return setError('Add a little detail: at least 20 characters.');
    setBusy(true);
    const result = await api.post<{ questionId: string }>('/api/v1/community/questions', { topic, title: title.trim(), body: body.trim() }, { idempotencyKey: key });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.push(`/community/${result.data.questionId}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Topic">
        {(props) => (
          <select {...props} className="tl-input" value={topic} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Question" required hint="One sentence, like “Is it normal for gums to bleed after flossing?”">
        {(props) => <Input {...props} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label="Details" required>
        {(props) => <textarea {...props} className="tl-input" rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" loading={busy}>
          Post question
        </Button>
      </div>
    </form>
  );
}
