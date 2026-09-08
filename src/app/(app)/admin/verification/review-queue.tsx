/**
 * Verification review queue.
 *
 * The reviewer's whole job on one screen: the registration numbers to check
 * against the dental council register, and the two decisions.
 *
 * A rejection cannot be submitted without a reason — enforced here as well as
 * on the server, because the reviewer typing it is the point. A rejection the
 * applicant cannot act on guarantees an identical resubmission and a second
 * review of the same profile.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
} from '@/design-system';
import { api } from '@/lib/api-client';

export interface PendingRequest {
  id: string;
  submittedAt: string;
  dentist: {
    profileId: string;
    slug: string;
    displayName: string | null;
    email: string | null;
    qualifications: Array<{
      degree: string;
      institution: string;
      year: number;
      registrationNumber: string | null;
      registrationBody: string | null;
    }>;
  } | null;
}

export function ReviewQueue({ requests }: { requests: readonly PendingRequest[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);

    const reason = reasons[id]?.trim() ?? '';
    if (decision === 'REJECTED' && reason.length < 1) {
      setError('A rejection needs a reason the applicant can act on.');
      return;
    }

    setBusyId(id);
    const result = await api.post('/api/v1/verification/review', {
      verificationRequestId: id,
      decision,
      decisionReason: reason || undefined,
    });
    setBusyId(null);

    if (result.ok) {
      setNotice(
        decision === 'APPROVED'
          ? 'Approved. The dentist appears in search once a clinic confirms where they practise.'
          : 'Rejected, and the reason has been sent to the applicant.',
      );
      router.refresh();
    } else {
      setError(result.message);
    }
  };

  if (requests.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting for review"
        description="Verification requests appear here as dentists submit them, oldest first."
      />
    );
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? (
        <Alert tone="danger" title="Could not record the decision">
          {error}
        </Alert>
      ) : null}

      {requests.map((request) => (
        <Card key={request.id} label={`Verification for ${request.dentist?.displayName ?? 'applicant'}`}>
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>{request.dentist?.displayName ?? 'Unknown applicant'}</strong>
              <span className="tl-muted">
                Submitted {new Date(request.submittedAt).toLocaleDateString()}
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <p className="tl-muted">
              {request.dentist?.email} · /{request.dentist?.slug}
            </p>

            <h3 style={{ fontSize: 'var(--tl-text-base)' }}>Credentials to check</h3>
            <ul className="tl-list">
              {request.dentist?.qualifications.map((q, index) => (
                <li key={`${request.id}-${index}`}>
                  <strong>
                    {q.degree} — {q.institution} ({q.year})
                  </strong>
                  <span className="tl-list__meta">
                    {q.registrationNumber
                      ? `${q.registrationBody ?? 'Council'} registration ${q.registrationNumber} — verify against the public register`
                      : 'No registration number. This qualification cannot be verified and will not receive a badge.'}
                  </span>
                </li>
              ))}
            </ul>

            <Field
              label="Decision reason"
              hint="Shown to the applicant. Required to reject; optional to approve."
            >
              {(props) => (
                <Input
                  {...props}
                  value={reasons[request.id] ?? ''}
                  onChange={(e) =>
                    setReasons((prev) => ({ ...prev, [request.id]: e.target.value }))
                  }
                  placeholder="e.g. Registration number not found on the DCI register."
                />
              )}
            </Field>

            <div className="tl-hero__actions" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
              <Button
                loading={busyId === request.id}
                onClick={() => decide(request.id, 'APPROVED')}
              >
                Approve
              </Button>
              <Button
                variant="danger"
                loading={busyId === request.id}
                onClick={() => decide(request.id, 'REJECTED')}
              >
                Reject
              </Button>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
