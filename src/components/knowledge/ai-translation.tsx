/**
 * "Translate with AI" on a published article — rendered only when an AI
 * provider is configured. The translation always carries its AI label, and
 * the reviewed article stays the source.
 */

'use client';

import { useState } from 'react';
import { Alert, Button, Card, CardBody, Field } from '@/design-system';
import { api } from '@/lib/api-client';

export function AiTranslation({ slug, languages }: { slug: string; languages: ReadonlyArray<{ code: string; name: string; nativeName: string }> }) {
  const [language, setLanguage] = useState(languages[0]?.code ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ translation: string; label: string; language: string } | null>(null);

  async function translate() {
    setBusy(true);
    setError(null);
    const response = await api.post<{ translation: string; label: string; language: string }>('/api/v1/ai/article-translations', { slug, language });
    setBusy(false);
    if (!response.ok) return setError(response.code === 'UNAUTHENTICATED' ? 'Sign in to use this.' : response.message);
    setResult(response.data);
  }

  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="tl-inline" style={{ alignItems: 'flex-end' }}>
        <Field label="Read it in">
          {(props) => (
            <select {...props} className="tl-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} ({l.name})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Button type="button" variant="secondary" loading={busy} onClick={translate} disabled={!language}>
          Translate with AI
        </Button>
      </div>
      {result ? (
        <Card label="AI translation">
          <CardBody>
            <div lang={result.language} style={{ whiteSpace: 'pre-wrap' }}>
              {result.translation}
            </div>
            <p className="tl-muted" style={{ marginBottom: 0 }}>
              <strong>AI</strong> · {result.label}
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
