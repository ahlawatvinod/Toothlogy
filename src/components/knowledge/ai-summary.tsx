/**
 * "Summarise with AI" on a published article — rendered only when an AI
 * provider is configured. The summary always carries its AI label.
 */

'use client';

import { useState } from 'react';
import { Alert, Button, Card, CardBody } from '@/design-system';
import { api } from '@/lib/api-client';

export function AiSummary({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; label: string } | null>(null);

  async function summarise() {
    setBusy(true);
    setError(null);
    const response = await api.post<{ summary: string; label: string }>('/api/v1/ai/article-summaries', { slug });
    setBusy(false);
    if (!response.ok) return setError(response.code === 'UNAUTHENTICATED' ? 'Sign in to use this.' : response.message);
    setResult(response.data);
  }

  if (result) {
    return (
      <Card label="AI summary">
        <CardBody>
          <p style={{ marginTop: 0 }}>{result.summary}</p>
          <p className="tl-muted" style={{ margin: 0 }}>
            <strong>AI</strong> · {result.label}
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <div className="tl-stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button type="button" variant="secondary" loading={busy} onClick={summarise}>
          Summarise with AI
        </Button>
      </div>
    </div>
  );
}
