/**
 * Answer a quote request: a total price (GST included) valid until a date,
 * or decline with a reason; close an accepted request once fulfilled.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

export function SellerQuoteActions({ quoteRequestId, status, currency }: { quoteRequestId: string; status: string; currency: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<'quote' | 'decline' | null>(null);
  const [price, setPrice] = useState('');
  // A week from today in India, worked out once when the form first renders.
  const [valid, setValid] = useState(() => new Date(Date.now() + 7 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.post(`/api/v1/quotes/${quoteRequestId}/actions`, body, { idempotencyKey: newIdempotencyKey() });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {status === 'NEW' || status === 'QUOTED' ? (
          <>
            <Button size="sm" aria-expanded={panel === 'quote'} onClick={() => setPanel(panel === 'quote' ? null : 'quote')}>
              {status === 'QUOTED' ? 'Revise quote' : 'Send quote'}
            </Button>
            <Button size="sm" variant="ghost" aria-expanded={panel === 'decline'} onClick={() => setPanel(panel === 'decline' ? null : 'decline')}>
              Decline
            </Button>
          </>
        ) : null}
        {status === 'ACCEPTED' ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => send({ action: 'CLOSE' }, 'Closed as fulfilled.')}>
            Mark fulfilled
          </Button>
        ) : null}
      </div>
      {panel === 'quote' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label={`Total, ${currency}, GST included`}>
            {(props) => <Input {...props} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
          </Field>
          <Field label="Valid until">
            {(props) => <Input {...props} type="date" value={valid} onChange={(e) => setValid(e.target.value)} />}
          </Field>
          <Field label="Note (optional)">
            {(props) => <Input {...props} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button
            size="sm"
            loading={busy}
            onClick={() => {
              const n = Number(price.replace(/,/g, ''));
              if (!Number.isFinite(n) || n <= 0) return setNotice({ tone: 'danger', text: 'Enter the total in rupees.' });
              void send({ action: 'QUOTE', priceMinor: String(Math.round(n * 100)), validUntil: `${valid}T23:59:00+05:30`, ...(note.trim() ? { note: note.trim() } : {}) }, 'Quote sent. The buyer has been told.');
            }}
          >
            Send
          </Button>
        </div>
      ) : null}
      {panel === 'decline' ? (
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Why?">
            {(props) => <Input {...props} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <Button size="sm" variant="danger" loading={busy} disabled={note.trim().length < 3} onClick={() => send({ action: 'DECLINE', note: note.trim() }, 'Declined. The buyer has been told.')}>
            Decline request
          </Button>
        </div>
      ) : null}
    </div>
  );
}
