/**
 * Issue a monthly statement, and — only when a payment provider is connected
 * — start a recharge of at least the configured minimum. Without a provider
 * the recharge form is not rendered at all; the page explains how funds are
 * added instead.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function BillingActions({
  organizationId,
  topUpAvailable,
  minimumTopUpMinor,
  currency,
}: {
  organizationId: string;
  topUpAvailable: boolean;
  minimumTopUpMinor: string | null;
  currency: string;
}) {
  const router = useRouter();
  const lastMonth = (() => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const [month, setMonth] = useState(lastMonth);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const minimumMajor = minimumTopUpMinor ? Number(minimumTopUpMinor) / 100 : null;

  async function issue() {
    setBusy('statement');
    const result = await api.post(`/api/v1/organizations/${organizationId}/billing/invoices`, { month });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Statement issued.' });
    router.refresh();
  }

  async function topUp() {
    const major = Number(amount);
    if (!Number.isFinite(major) || major <= 0) return setNotice({ tone: 'danger', text: 'Enter the amount to recharge.' });
    if (minimumMajor !== null && major < minimumMajor) {
      return setNotice({ tone: 'danger', text: `The minimum recharge is ${new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minimumMajor)}.` });
    }
    setBusy('topup');
    const result = await api.post<{ actionUrl: string | null; status: string }>(
      `/api/v1/organizations/${organizationId}/billing/top-up`,
      { amountMinor: String(Math.round(major * 100)) },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    if (result.data.actionUrl) window.location.assign(result.data.actionUrl);
    else setNotice({ tone: 'info', text: 'Payment started. Funds are added only once the provider confirms the payment.' });
  }

  return (
    <Card label="Actions">
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <div className="tl-inline" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Monthly statement for">
              {(props) => <Input {...props} type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />}
            </Field>
            <Button variant="secondary" loading={busy === 'statement'} onClick={issue}>
              Issue statement
            </Button>
          </div>
          {topUpAvailable ? (
            <div className="tl-inline" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Recharge amount" hint={minimumMajor !== null ? `At least ${minimumMajor.toLocaleString('en-IN')} including GST.` : undefined}>
                {(props) => <Input {...props} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}
              </Field>
              <Button loading={busy === 'topup'} onClick={topUp}>
                Pay and recharge
              </Button>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
