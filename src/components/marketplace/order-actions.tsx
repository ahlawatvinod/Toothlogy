/**
 * What each side may do next on an order.
 *
 * Seller (with tl.marketplace.order.manage): confirm or decline, dispatch
 * (issues the tax invoice), cancel with a reason, mark delivered, issue the
 * invoice, record a payment received or a refund, and act on a return.
 * Buyer: cancel before confirmation, confirm receipt, pay online (offered
 * only when a payment provider is connected), ask to return items within the
 * seller's window, cancel a return. The server decides; this only offers.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;
type Status = 'PLACED' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED' | 'DECLINED';
type Panel = null | 'DECLINE' | 'CANCEL' | 'DISPATCH' | 'PAYMENT' | 'RETURN' | 'REJECT_RETURN' | 'REFUND';

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100)) : null;
};

const METHODS = [
  ['UPI', 'UPI'],
  ['BANK_TRANSFER', 'Bank transfer'],
  ['CASH', 'Cash'],
  ['CHEQUE', 'Cheque'],
  ['CARD_ON_DELIVERY', 'Card on delivery'],
  ['OTHER', 'Other'],
] as const;

export function OrderActions(props: {
  orderId: string;
  side: 'BUYER' | 'SELLER';
  canManage: boolean;
  status: Status;
  invoiceIssued: boolean;
  dueRupees: string;
  refundableRupees: string;
  onlinePaymentAvailable: boolean;
  openReturn: { id: string; status: string; refundRupees: string } | null;
  returnable: ReadonlyArray<{ id: string; name: string; left: number }> | null;
  today: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [payment, setPayment] = useState({ kind: 'RECEIPT' as 'RECEIPT' | 'REFUND', method: 'UPI', amount: props.dueRupees, receivedOn: props.today, reference: '' });
  const [reason, setReason] = useState('DAMAGED');
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const seller = props.side === 'SELLER' && props.canManage;
  const buyer = props.side === 'BUYER';
  const open = (next: Panel) => {
    setPanel((p) => (p === next ? null : next));
    setText('');
    setNotice(null);
  };

  async function send(key: string, path: string, body: unknown, done: string, idempotent = false) {
    setBusy(key);
    setNotice(null);
    const result = await api.post(path, body, idempotent ? { idempotencyKey: newIdempotencyKey() } : undefined);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setPanel(null);
    setText('');
    router.refresh();
  }
  const act = (action: string, extra: Record<string, unknown>, done: string) => send(action, `/api/v1/orders/${props.orderId}/actions`, { action, ...extra }, done);
  const onReturn = (action: string, extra: Record<string, unknown>, done: string) => send(`R-${action}`, `/api/v1/returns/${props.openReturn!.id}/actions`, { action, ...extra }, done);

  function recordPayment(extra: Record<string, unknown> = {}) {
    const amountMinor = toPaise(payment.amount);
    if (!amountMinor) return setNotice({ tone: 'danger', text: 'Enter the amount in rupees.' });
    void send(
      'PAYMENT',
      `/api/v1/orders/${props.orderId}/payments`,
      { kind: payment.kind, method: payment.method, amountMinor, receivedOn: payment.receivedOn, ...(payment.reference.trim() ? { reference: payment.reference.trim() } : {}), ...extra },
      payment.kind === 'RECEIPT' ? 'Payment recorded. The buyer has been told.' : 'Refund recorded. The buyer has been told.',
      true,
    );
  }

  function askReturn() {
    const lines = Object.entries(quantities)
      .map(([orderLineId, q]) => ({ orderLineId, quantity: Number(q) }))
      .filter((l) => Number.isInteger(l.quantity) && l.quantity > 0);
    if (lines.length === 0) return setNotice({ tone: 'danger', text: 'Enter how many of each item to return.' });
    void send('RETURN', `/api/v1/orders/${props.orderId}/returns`, { reason, lines, ...(text.trim() ? { details: text.trim() } : {}) }, 'Return requested. The seller has been told.');
  }

  const paymentForm = (extra: Record<string, unknown> = {}, lockAmount = false) => (
    <div className="tl-stack">
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {!lockAmount ? (
          <Field label="Received or refunded">
            {(p) => (
              <select {...p} className="tl-input" value={payment.kind} onChange={(e) => setPayment((v) => ({ ...v, kind: e.target.value as 'RECEIPT' | 'REFUND', amount: e.target.value === 'RECEIPT' ? props.dueRupees : props.refundableRupees }))}>
                <option value="RECEIPT">Payment received</option>
                <option value="REFUND">Refund paid back</option>
              </select>
            )}
          </Field>
        ) : null}
        <Field label="Method">
          {(p) => (
            <select {...p} className="tl-input" value={payment.method} onChange={(e) => setPayment((v) => ({ ...v, method: e.target.value }))}>
              {METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Amount (rupees)">{(p) => <Input {...p} inputMode="decimal" value={payment.amount} readOnly={lockAmount} onChange={(e) => setPayment((v) => ({ ...v, amount: e.target.value }))} />}</Field>
        <Field label="Date">{(p) => <Input {...p} type="date" max={props.today} value={payment.receivedOn} onChange={(e) => setPayment((v) => ({ ...v, receivedOn: e.target.value }))} />}</Field>
        <Field label="Reference (optional)">{(p) => <Input {...p} maxLength={80} value={payment.reference} onChange={(e) => setPayment((v) => ({ ...v, reference: e.target.value }))} />}</Field>
      </div>
      <div>
        <Button size="sm" loading={busy === 'PAYMENT'} onClick={() => recordPayment(extra)}>
          Record
        </Button>
      </div>
    </div>
  );

  const reasonBox = (label: string, onSend: () => void, key: string) => (
    <div className="tl-stack">
      <Field label={label} required>
        {(p) => <textarea {...p} className="tl-input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <div>
        <Button size="sm" loading={busy === key} disabled={text.trim().length < 3} onClick={onSend}>
          Send
        </Button>
      </div>
    </div>
  );

  const buttons: React.ReactNode[] = [];
  if (seller) {
    if (props.status === 'PLACED') {
      buttons.push(
        <Button key="confirm" size="sm" loading={busy === 'CONFIRM'} onClick={() => act('CONFIRM', {}, 'Confirmed. The buyer can now pay you as your profile says.')}>
          Confirm order
        </Button>,
        <Button key="decline" size="sm" variant="secondary" aria-expanded={panel === 'DECLINE'} onClick={() => open('DECLINE')}>
          Decline
        </Button>,
      );
    }
    if (props.status === 'CONFIRMED') {
      buttons.push(
        <Button key="dispatch" size="sm" aria-expanded={panel === 'DISPATCH'} onClick={() => open('DISPATCH')}>
          Dispatch
        </Button>,
        <Button key="cancel" size="sm" variant="ghost" aria-expanded={panel === 'CANCEL'} onClick={() => open('CANCEL')}>
          Cancel order
        </Button>,
      );
    }
    if (props.status === 'DISPATCHED') {
      buttons.push(
        <Button key="delivered" size="sm" loading={busy === 'DELIVERED'} onClick={() => act('DELIVERED', {}, 'Marked delivered.')}>
          Mark delivered
        </Button>,
      );
    }
    if (!props.invoiceIssued && (props.status === 'CONFIRMED' || props.status === 'DISPATCHED' || props.status === 'DELIVERED')) {
      buttons.push(
        <Button key="invoice" size="sm" variant="secondary" loading={busy === 'ISSUE_INVOICE'} onClick={() => act('ISSUE_INVOICE', {}, 'Tax invoice issued.')}>
          Issue tax invoice
        </Button>,
      );
    }
    if (props.status !== 'PLACED' && props.status !== 'DECLINED') {
      buttons.push(
        <Button key="payment" size="sm" variant="secondary" aria-expanded={panel === 'PAYMENT'} onClick={() => open('PAYMENT')}>
          Record a payment
        </Button>,
      );
    }
    if (props.openReturn?.status === 'REQUESTED') {
      buttons.push(
        <Button key="approve" size="sm" loading={busy === 'R-APPROVE'} onClick={() => onReturn('APPROVE', {}, 'Return approved. The buyer has been told.')}>
          Approve return
        </Button>,
        <Button key="reject" size="sm" variant="ghost" aria-expanded={panel === 'REJECT_RETURN'} onClick={() => open('REJECT_RETURN')}>
          Decline return
        </Button>,
      );
    }
    if (props.openReturn?.status === 'APPROVED') {
      buttons.push(
        <Button key="received" size="sm" loading={busy === 'R-RECEIVED'} onClick={() => onReturn('RECEIVED', {}, 'Items received. The credit note was issued.')}>
          Returned items received
        </Button>,
      );
    }
    if (props.openReturn?.status === 'RECEIVED') {
      buttons.push(
        <Button
          key="refund"
          size="sm"
          aria-expanded={panel === 'REFUND'}
          onClick={() => {
            setPayment((v) => ({ ...v, kind: 'REFUND', amount: props.openReturn!.refundRupees }));
            open('REFUND');
          }}
        >
          Record the refund
        </Button>,
      );
    }
  }
  if (buyer) {
    if (props.status === 'PLACED') {
      buttons.push(
        <Button key="bcancel" size="sm" variant="ghost" loading={busy === 'CANCEL'} onClick={() => act('CANCEL', {}, 'Order cancelled. The seller has been told.')}>
          Cancel order
        </Button>,
      );
    }
    if (props.status === 'DISPATCHED') {
      buttons.push(
        <Button key="received" size="sm" loading={busy === 'DELIVERED'} onClick={() => act('DELIVERED', {}, 'Thanks — marked as received.')}>
          I received it
        </Button>,
      );
    }
    if (props.onlinePaymentAvailable && props.dueRupees !== '0.00' && (props.status === 'CONFIRMED' || props.status === 'DISPATCHED' || props.status === 'DELIVERED')) {
      buttons.push(
        <Button key="pay" size="sm" loading={busy === 'PAY'} onClick={() => send('PAY', `/api/v1/orders/${props.orderId}/pay-online`, {}, 'Continue with the payment provider.', true)}>
          Pay online
        </Button>,
      );
    }
    if (props.returnable && props.returnable.length > 0) {
      buttons.push(
        <Button key="return" size="sm" variant="secondary" aria-expanded={panel === 'RETURN'} onClick={() => open('RETURN')}>
          Return items
        </Button>,
      );
    }
    if (props.openReturn && (props.openReturn.status === 'REQUESTED' || props.openReturn.status === 'APPROVED')) {
      buttons.push(
        <Button key="rcancel" size="sm" variant="ghost" loading={busy === 'R-CANCEL'} onClick={() => onReturn('CANCEL', {}, 'Return cancelled.')}>
          Cancel return
        </Button>,
      );
    }
  }

  if (buttons.length === 0 && !notice) return null;

  return (
    <Card label="Next steps">
      <CardHeader>
        <strong>Next steps</strong>
      </CardHeader>
      <CardBody>
        <div className="tl-stack">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {buttons}
          </div>
          {panel === 'DECLINE' ? reasonBox('Why you cannot take this order', () => act('DECLINE', { note: text.trim() }, 'Declined. The buyer has been told.'), 'DECLINE') : null}
          {panel === 'CANCEL' ? reasonBox('Why the order is cancelled', () => act('CANCEL', { note: text.trim() }, 'Cancelled. The buyer has been told.'), 'CANCEL') : null}
          {panel === 'REJECT_RETURN' ? reasonBox('Why you cannot take the return', () => onReturn('REJECT', { note: text.trim() }, 'Return declined. The buyer has been told.'), 'R-REJECT') : null}
          {panel === 'DISPATCH' ? (
            <div className="tl-stack">
              <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Carrier (optional)">{(p) => <Input {...p} maxLength={80} value={carrier} onChange={(e) => setCarrier(e.target.value)} />}</Field>
                <Field label="Tracking number (optional)">{(p) => <Input {...p} maxLength={80} value={tracking} onChange={(e) => setTracking(e.target.value)} />}</Field>
              </div>
              <p className="tl-muted" style={{ margin: 0 }}>
                Dispatching issues the tax invoice if you have not issued it.
              </p>
              <div>
                <Button size="sm" loading={busy === 'DISPATCH'} onClick={() => act('DISPATCH', { ...(carrier.trim() ? { carrier: carrier.trim() } : {}), ...(tracking.trim() ? { trackingReference: tracking.trim() } : {}) }, 'Dispatched. The tax invoice is issued and the buyer has been told.')}>
                  Mark dispatched
                </Button>
              </div>
            </div>
          ) : null}
          {panel === 'PAYMENT' ? paymentForm() : null}
          {panel === 'REFUND' && props.openReturn ? paymentForm({ returnRequestId: props.openReturn.id }, true) : null}
          {panel === 'RETURN' && props.returnable ? (
            <div className="tl-stack">
              <Field label="Reason">
                {(p) => (
                  <select {...p} className="tl-input" value={reason} onChange={(e) => setReason(e.target.value)}>
                    <option value="DAMAGED">Arrived damaged</option>
                    <option value="WRONG_ITEM">Wrong item sent</option>
                    <option value="NOT_AS_DESCRIBED">Not as described</option>
                    <option value="EXPIRED">Expired or near expiry</option>
                    <option value="OTHER">Other</option>
                  </select>
                )}
              </Field>
              <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {props.returnable.map((l) => (
                  <Field key={l.id} label={`${l.name}: how many to return`} hint={`Up to ${l.left}.`}>
                    {(p) => <Input {...p} inputMode="numeric" value={quantities[l.id] ?? ''} onChange={(e) => setQuantities((q) => ({ ...q, [l.id]: e.target.value }))} />}
                  </Field>
                ))}
              </div>
              <Field label="What is wrong" hint={reason === 'OTHER' ? 'Required for “Other”.' : 'Optional.'}>
                {(p) => <textarea {...p} className="tl-input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />}
              </Field>
              <div>
                <Button size="sm" loading={busy === 'RETURN'} onClick={askReturn}>
                  Ask to return
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
