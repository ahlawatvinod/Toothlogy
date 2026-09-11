/**
 * Dentists who say they practise here.
 *
 * Confirming is the clinic's statement that the dentist really works at this
 * branch — the check that keeps a dentist out of a clinic's results without
 * the clinic's agreement. Whether the dentist's own credentials have been
 * verified is shown beside each claim, so the clinic confirms knowingly.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, EmptyState } from '@/design-system';
import { api } from '@/lib/api-client';

export interface PracticeClaimRow {
  readonly id: string;
  readonly dentistName: string;
  readonly dentistVerified: boolean;
  readonly locationName: string;
  readonly isConfirmed: boolean;
}

export function PracticeClaimsPanel({
  organizationId,
  claims,
  canConfirm,
}: {
  organizationId: string;
  claims: readonly PracticeClaimRow[];
  canConfirm: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function confirm(practiceId: string) {
    setBusy(practiceId);
    setNotice(null);
    const result = await api.post<{ message: string }>(`/api/v1/organizations/${organizationId}/practices`, {
      practiceId,
    });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: result.data.message });
    router.refresh();
  }

  if (claims.length === 0) {
    return (
      <EmptyState
        title="No dentists have claimed a practice here"
        description="A dentist adds your branch from their own profile; the claim then appears here for you to confirm."
      />
    );
  }

  return (
    <div className="tl-stack">
      {notice ? (
        <Alert tone={notice.tone} title={notice.tone === 'success' ? 'Practice confirmed' : 'Could not confirm'}>
          {notice.text}
        </Alert>
      ) : null}
      <ul className="tl-list">
        {claims.map((c) => (
          <li key={c.id}>
            <div className="tl-card__title-row">
              <strong>{c.dentistName}</strong>
              {c.isConfirmed ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Awaiting your confirmation</Badge>}
              {c.dentistVerified ? (
                <Badge tone="info">Credentials verified</Badge>
              ) : (
                <Badge tone="neutral">Credentials not yet verified</Badge>
              )}
            </div>
            <span className="tl-list__meta">At {c.locationName}</span>
            {!c.isConfirmed && canConfirm ? (
              <div>
                <Button size="sm" loading={busy === c.id} onClick={() => confirm(c.id)}>
                  Confirm {c.dentistName} practises at {c.locationName}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
