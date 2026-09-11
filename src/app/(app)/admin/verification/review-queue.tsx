/**
 * Verification review queue.
 *
 * The reviewer's whole job on one screen: what to check (registration numbers
 * against the issuing register, the documents themselves), and the two
 * decisions.
 *
 * A rejection cannot be submitted without a reason — enforced here as well as
 * on the server, because the reviewer typing it is the point. A rejection the
 * applicant cannot act on guarantees an identical resubmission and a second
 * review of the same application.
 *
 * Documents open through a signed, short-lived URL minted per click after the
 * server re-checks that this reviewer may read that file.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export interface PendingRequest {
  id: string;
  kind: 'dentist' | 'organization' | 'claim';
  submittedLabel: string;
  isOwnRequest: boolean;
  submitter: { name: string | null; email: string | null } | null;
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
  organization: {
    name: string;
    slug: string;
    type: string;
    countryCode: string;
    registrationNumber: string | null;
    taxIdentifier: string | null;
    locations: number;
    alreadyOwned: boolean;
  } | null;
  claimRole: string | null;
  note: string | null;
  documents: Array<{ fileId: string; purpose: string }>;
}

const APPROVED_MESSAGE: Record<PendingRequest['kind'], string> = {
  dentist: 'Approved. The dentist appears in search once a clinic confirms where they practise.',
  organization: 'Approved. The organization now carries a Verified badge for two years.',
  claim: 'Approved. The claimant is now the owner and administrator of the listing.',
};

function title(request: PendingRequest): string {
  if (request.kind === 'dentist') return request.dentist?.displayName ?? 'Dentist';
  if (request.kind === 'organization') return `Organization: ${request.organization?.name ?? 'unknown'}`;
  return `Claim of ${request.organization?.name ?? 'a listing'} by ${request.submitter?.name ?? request.submitter?.email ?? 'unknown'}`;
}

function purposeLabel(purpose: string): string {
  return purpose.charAt(0) + purpose.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function ReviewQueue({ requests }: { requests: readonly PendingRequest[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (request: PendingRequest, decision: 'APPROVED' | 'REJECTED') => {
    setError(null);
    setNotice(null);

    const reason = reasons[request.id]?.trim() ?? '';
    if (decision === 'REJECTED' && reason.length < 1) {
      setError('A rejection needs a reason the applicant can act on.');
      return;
    }

    setBusyId(request.id);
    const result = await api.post('/api/v1/verification/review', {
      verificationRequestId: request.id,
      decision,
      decisionReason: reason || undefined,
    });
    setBusyId(null);

    if (result.ok) {
      setNotice(decision === 'APPROVED' ? APPROVED_MESSAGE[request.kind] : 'Rejected. The applicant sees your reason.');
      router.refresh();
    } else {
      setError(result.message);
    }
  };

  const openDocument = async (fileId: string) => {
    setError(null);
    // Opened before the request so a popup blocker treats it as the click's own
    // window; pointed at the signed URL once the server has minted it.
    const tab = window.open('', '_blank');
    const result = await api.get<{ url: string }>(`/api/v1/files/${encodeURIComponent(fileId)}/url`);
    if (!result.ok) {
      tab?.close();
      setError(result.message);
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.url;
    } else {
      window.location.assign(result.data.url);
    }
  };

  // Rendered above the list AND above the empty state: deciding the last
  // request empties the queue, and the reviewer still needs to see it worked.
  const feedback = (
    <>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {error ? (
        <Alert tone="danger" title="That did not work">
          {error}
        </Alert>
      ) : null}
    </>
  );

  if (requests.length === 0) {
    return (
      <div className="tl-stack">
        {feedback}
        <EmptyState
          title="Nothing waiting for review"
          description="Dentist, organization and clinic-claim requests appear here as they are submitted, oldest first."
        />
      </div>
    );
  }

  return (
    <div className="tl-stack">
      {feedback}

      {requests.map((request) => (
        <Card key={request.id} label={`Verification: ${title(request)}`}>
          <CardHeader>
            <div className="tl-card__title-row">
              <strong>{title(request)}</strong>
              <Badge tone={request.kind === 'claim' ? 'warning' : 'info'}>
                {request.kind === 'dentist' ? 'Dentist' : request.kind === 'organization' ? 'Organization' : 'Listing claim'}
              </Badge>
              <span className="tl-muted">Submitted {request.submittedLabel}</span>
            </div>
          </CardHeader>
          <CardBody>
            {request.kind === 'dentist' && request.dentist ? (
              <>
                <p className="tl-muted">
                  {request.dentist.email} · /{request.dentist.slug}
                </p>
                <h3 style={{ fontSize: 'var(--tl-text-base)' }}>Credentials to check</h3>
                <ul className="tl-list">
                  {request.dentist.qualifications.map((q, index) => (
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
              </>
            ) : null}

            {request.kind !== 'dentist' && request.organization ? (
              <dl className="tl-kv">
                <div>
                  <dt>Organization</dt>
                  <dd>
                    {request.organization.name} · {request.organization.type.toLowerCase()} · {request.organization.countryCode} · /
                    {request.organization.slug}
                  </dd>
                </div>
                <div>
                  <dt>Registration number</dt>
                  <dd>{request.organization.registrationNumber ?? 'Not provided'}</dd>
                </div>
                {request.organization.taxIdentifier ? (
                  <div>
                    <dt>Tax identifier</dt>
                    <dd>{request.organization.taxIdentifier}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Branches</dt>
                  <dd>{request.organization.locations}</dd>
                </div>
                <div>
                  <dt>Submitted by</dt>
                  <dd>
                    {request.submitter?.name ?? '—'} {request.submitter?.email ? `(${request.submitter.email})` : ''}
                  </dd>
                </div>
                {request.claimRole ? (
                  <div>
                    <dt>Stated role</dt>
                    <dd>{request.claimRole}</dd>
                  </div>
                ) : null}
                {request.note ? (
                  <div>
                    <dt>Note</dt>
                    <dd>{request.note}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {request.kind === 'claim' && request.organization?.alreadyOwned ? (
              <Alert tone="warning" title="This listing already has an owner">
                Approving will be refused. Reject with a reason, or ask the claimant to contact the current administrators.
              </Alert>
            ) : null}

            {request.documents.length > 0 ? (
              <div>
                <h3 style={{ fontSize: 'var(--tl-text-base)' }}>Documents</h3>
                <ul className="tl-list">
                  {request.documents.map((d) => (
                    <li key={d.fileId}>
                      <Button size="sm" variant="secondary" onClick={() => openDocument(d.fileId)}>
                        Open {purposeLabel(d.purpose)}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : request.kind !== 'dentist' ? (
              <p className="tl-muted">No documents were attached.</p>
            ) : null}

            {request.isOwnRequest ? (
              <Alert tone="info" title="This is your own application">
                Another reviewer must decide it.
              </Alert>
            ) : (
              <>
                <Field label="Decision reason" hint="Shown to the applicant. Required to reject; optional to approve.">
                  {(props) => (
                    <Input
                      {...props}
                      value={reasons[request.id] ?? ''}
                      onChange={(e) => setReasons((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      placeholder="e.g. The registration number is not on the issuing register."
                    />
                  )}
                </Field>

                <div className="tl-inline" style={{ marginBlockStart: 'var(--tl-space-3)' }}>
                  <Button loading={busyId === request.id} onClick={() => decide(request, 'APPROVED')}>
                    Approve
                  </Button>
                  <Button variant="danger" loading={busyId === request.id} onClick={() => decide(request, 'REJECTED')}>
                    Reject
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
