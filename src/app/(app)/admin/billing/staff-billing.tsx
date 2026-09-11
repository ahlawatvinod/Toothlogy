/**
 * Staff billing actions. A credit carries one idempotency key per intent, so
 * a double submit records the transfer once; the key resets only after a
 * successful credit.
 */

'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Table } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function StaffBilling({
  canAdjust,
  canResolve,
  organizations,
  wallets,
  disputes,
  entries,
}: {
  canAdjust: boolean;
  canResolve: boolean;
  organizations: Array<{ id: string; name: string }>;
  wallets: Array<{ organization: string; balance: string }>;
  disputes: Array<{ id: string; organization: string; reason: string; note: string | null; raised: string; charge: string; selfRaised: boolean }>;
  entries: Array<{ id: string; organization: string; kind: string; amount: string; when: string; reference: string; reversible: boolean }>;
}) {
  const router = useRouter();
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [belowMinimum, setBelowMinimum] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const creditKey = useRef<string | null>(null);

  async function credit() {
    const rupees = Number(amount);
    if (!organizationId) return setNotice({ tone: 'danger', text: 'Choose an organization.' });
    if (!Number.isFinite(rupees) || rupees <= 0) return setNotice({ tone: 'danger', text: 'Enter the amount received.' });
    if (reference.trim().length < 3) return setNotice({ tone: 'danger', text: 'Record the bank or transfer reference.' });
    if (belowMinimum && memo.trim().length < 10) return setNotice({ tone: 'danger', text: 'Say why this recharge is below the minimum (at least 10 characters in the note).' });
    creditKey.current ??= newIdempotencyKey();
    setBusy('credit');
    const result = await api.post<{ balanceAfterMinor: string; leadsCharged: number }>(
      '/api/v1/admin/billing/credits',
      {
        organizationId,
        amountMinor: String(Math.round(rupees * 100)),
        externalReference: reference.trim(),
        ...(memo.trim() ? { memo: memo.trim() } : {}),
        ...(belowMinimum ? { allowBelowMinimum: true } : {}),
      },
      { idempotencyKey: creditKey.current },
    );
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    creditKey.current = null;
    setAmount('');
    setReference('');
    setMemo('');
    setBelowMinimum(false);
    setNotice({ tone: 'success', text: `Recorded. ${result.data.leadsCharged} waiting lead${result.data.leadsCharged === 1 ? '' : 's'} charged.` });
    router.refresh();
  }

  async function reverse(entryId: string) {
    const reason = notes[entryId]?.trim() ?? '';
    if (reason.length < 5) return setNotice({ tone: 'danger', text: 'Give a reason for the reversal (at least 5 characters).' });
    setBusy(entryId);
    const result = await api.post('/api/v1/admin/billing/reversals', { entryId, reason });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Reversed.' });
    router.refresh();
  }

  async function decide(disputeId: string, decision: 'ACCEPTED' | 'REJECTED') {
    const note = notes[disputeId]?.trim() ?? '';
    if (note.length < 5) return setNotice({ tone: 'danger', text: 'Explain the decision to the practice.' });
    setBusy(disputeId);
    const result = await api.post(`/api/v1/admin/billing/disputes/${disputeId}`, { decision, note });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: decision === 'ACCEPTED' ? 'Upheld and refunded.' : 'Rejected.' });
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      {canAdjust ? (
        <Card label="Record a transfer">
          <CardHeader>
            <strong>Record a transfer received</strong>
          </CardHeader>
          <CardBody>
            <div className="tl-form-grid">
              <Field label="Organization">
                {(props) => (
                  <select {...props} className="tl-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Amount received (₹)">
                {(props) => <Input {...props} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Field label="Bank / transfer reference" required>
                {(props) => <Input {...props} value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />}
              </Field>
              <Field label="Note" hint={belowMinimum ? 'Required: why this recharge is below the minimum.' : undefined}>
                {(props) => <Input {...props} value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} />}
              </Field>
            </div>
            <p className="tl-muted">
              A recharge must cover at least the minimum number of paid leads, GST included (20 × ₹59 = ₹1,180 in India). The server refuses less unless
              you allow it below and say why; that choice is audited.
            </p>
            <label className="tl-inline" style={{ marginBlockEnd: 'var(--tl-space-3)' }}>
              <input type="checkbox" checked={belowMinimum} onChange={(e) => setBelowMinimum(e.target.checked)} />
              <span>Allow this recharge below the minimum (explain in the note)</span>
            </label>
            <Button loading={busy === 'credit'} onClick={credit}>
              Record transfer
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {canResolve ? (
        <Card label="Open disputes">
          <CardHeader>
            <strong>Open disputes ({disputes.length})</strong>
          </CardHeader>
          <CardBody>
            {disputes.length === 0 ? (
              <p className="tl-muted" style={{ margin: 0 }}>
                None open.
              </p>
            ) : (
              <ul className="tl-list">
                {disputes.map((d) => (
                  <li key={d.id} className="tl-stack">
                    <div className="tl-card__title-row">
                      <strong>{d.organization}</strong>
                      <Badge tone="warning">{d.reason.replace(/_/g, ' ').toLowerCase()}</Badge>
                      <span className="tl-muted">
                        {d.charge} · raised {d.raised}
                      </span>
                    </div>
                    {d.note ? <span className="tl-list__meta">“{d.note}”</span> : null}
                    {d.selfRaised ? (
                      <span className="tl-muted">You raised this dispute; another staff member must decide it.</span>
                    ) : (
                      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <Field label="Decision note (shown to the practice)">
                          {(props) => <Input {...props} value={notes[d.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))} />}
                        </Field>
                        <Button size="sm" loading={busy === d.id} onClick={() => decide(d.id, 'ACCEPTED')}>
                          Uphold and refund
                        </Button>
                        <Button size="sm" variant="secondary" loading={busy === d.id} onClick={() => decide(d.id, 'REJECTED')}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card label="Wallets">
        <CardHeader>
          <strong>Wallets</strong>
        </CardHeader>
        <CardBody>
          {wallets.length === 0 ? (
            <p className="tl-muted" style={{ margin: 0 }}>
              No wallets yet.
            </p>
          ) : (
            <ul className="tl-list">
              {wallets.map((w) => (
                <li key={w.organization}>
                  <strong>{w.organization}</strong> <span className="tl-list__meta">{w.balance}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card label="Recent ledger entries">
        <CardHeader>
          <strong>Recent ledger entries</strong>
        </CardHeader>
        <CardBody>
          <Table caption="Most recent ledger entries across all wallets">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Organization</th>
                <th scope="col">Kind</th>
                <th scope="col">Amount</th>
                <th scope="col">Reference</th>
                {canAdjust ? <th scope="col">Reverse</th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.when}</td>
                  <td>{e.organization}</td>
                  <td>{e.kind.replace('_', ' ').toLowerCase()}</td>
                  <td>{e.amount}</td>
                  <td>{e.reference || '—'}</td>
                  {canAdjust ? (
                    <td>
                      {e.reversible ? (
                        <span className="tl-inline">
                          <Input
                            aria-label={`Reason to reverse entry ${e.id}`}
                            value={notes[e.id] ?? ''}
                            onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                            placeholder="Reason"
                          />
                          <Button size="sm" variant="ghost" loading={busy === e.id} onClick={() => reverse(e.id)}>
                            Reverse
                          </Button>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
