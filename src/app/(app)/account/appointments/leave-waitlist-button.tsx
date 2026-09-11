'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/design-system';
import { api } from '@/lib/api-client';

/** Leave a waitlist; any time held for the entry is released. */
export function LeaveWaitlistButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="tl-inline">
      <Button
        size="sm"
        variant="ghost"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const result = await api.delete(`/api/v1/waitlist/${encodeURIComponent(entryId)}`);
          setBusy(false);
          if (!result.ok) return setError(result.message);
          router.refresh();
        }}
      >
        Leave waitlist
      </Button>
      {error ? (
        <span className="tl-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
