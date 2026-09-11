/**
 * Open a private file: ask for a short-lived signed link (the server checks
 * the reader and records the opening), then open it. If the browser blocks
 * the new tab, the link is offered to click.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/design-system';
import { api } from '@/lib/api-client';

export function OpenFileButton({ fileId, label = 'Open file' }: { fileId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    setFallback(null);
    const result = await api.get<{ url: string }>(`/api/v1/files/${fileId}/url`);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    const opened = window.open(result.data.url, '_blank', 'noopener,noreferrer');
    if (!opened) setFallback(result.data.url);
  }

  return (
    <span className="tl-inline" style={{ flexWrap: 'wrap' }}>
      <Button type="button" variant="secondary" loading={busy} onClick={open}>
        {label}
      </Button>
      {fallback ? (
        <a href={fallback} target="_blank" rel="noopener noreferrer">
          Open it now (the link lasts a minute)
        </a>
      ) : null}
      {error ? (
        <span role="alert" className="tl-muted">
          {error}
        </span>
      ) : null}
    </span>
  );
}
