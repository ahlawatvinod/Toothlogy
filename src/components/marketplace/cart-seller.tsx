/**
 * One seller's part of the cart: its lines (change quantity, remove), what
 * stops an order, and the delivery form that places the order. The checkout
 * carries one idempotency key per attempt, so a double click or a retried
 * request cannot place two orders.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

interface Line {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  unit: string | null;
  quantity: number;
  minimum: number;
  unitPrice: string | null;
  gross: string | null;
  problem: string | null;
}

function LineRow({ line }: { line: Line }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < line.minimum) return setError(`Enter a whole number of at least ${line.minimum}.`);
    setBusy(true);
    setError(null);
    const result = await api.post('/api/v1/me/cart', { productId: line.productId, variantId: line.variantId, quantity: n });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    const result = await api.delete(`/api/v1/me/cart/${line.id}`);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    router.refresh();
  }

  return (
    <tr>
      <td>
        <strong>{line.name}</strong>
        {line.variantLabel ? <div className="tl-muted">{line.variantLabel}</div> : null}
        {line.problem ? <div role="status" className="tl-field__error">{line.problem}</div> : null}
        {error ? <div role="alert" className="tl-field__error">{error}</div> : null}
      </td>
      <td>{line.unitPrice ? `${line.unitPrice}${line.unit ? ` per ${line.unit}` : ''}` : '—'}</td>
      <td>
        <div className="tl-inline" style={{ flexWrap: 'nowrap', gap: 'var(--tl-space-2)' }}>
          <input className="tl-input" style={{ width: '5.5rem' }} inputMode="numeric" aria-label={`Quantity of ${line.name}${line.variantLabel ? ` ${line.variantLabel}` : ''}`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          <Button size="sm" variant="secondary" loading={busy} onClick={update} disabled={quantity === String(line.quantity)}>
            Update
          </Button>
        </div>
      </td>
      <td>{line.gross ?? '—'}</td>
      <td>
        <Button size="sm" variant="ghost" onClick={remove} disabled={busy} aria-label={`Remove ${line.name}${line.variantLabel ? ` ${line.variantLabel}` : ''}`}>
          Remove
        </Button>
      </td>
    </tr>
  );
}

export function CartSeller({
  seller,
  total,
  problems,
  lines,
  districts,
  organizations,
  defaults,
  emailVerified,
}: {
  seller: { id: string; name: string; slug: string };
  total: string;
  problems: number;
  lines: Line[];
  districts: ReadonlyArray<{ id: string; label: string }>;
  organizations: ReadonlyArray<{ id: string; name: string }>;
  defaults: { name: string; phone: string };
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ deliveryName: defaults.name, deliveryPhone: defaults.phone, deliveryAddress: '', deliveryDistrictId: '', buyerOrganizationId: '', buyerTaxIdentifier: '', buyerNote: '' });
  const [key, setKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function place(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.deliveryDistrictId) return setError('Choose the delivery district.');
    setBusy(true);
    const result = await api.post<{ orderId: string }>(
      '/api/v1/me/orders',
      {
        sellerOrganizationId: seller.id,
        deliveryName: form.deliveryName.trim(),
        deliveryPhone: form.deliveryPhone.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        deliveryDistrictId: form.deliveryDistrictId,
        ...(form.buyerOrganizationId ? { buyerOrganizationId: form.buyerOrganizationId } : {}),
        ...(form.buyerTaxIdentifier.trim() ? { buyerTaxIdentifier: form.buyerTaxIdentifier.trim() } : {}),
        ...(form.buyerNote.trim() ? { buyerNote: form.buyerNote.trim() } : {}),
      },
      { idempotencyKey: key },
    );
    if (!result.ok) {
      setBusy(false);
      setKey(newIdempotencyKey());
      return setError(result.message);
    }
    router.push(`/orders/${result.data.orderId}`);
  }

  return (
    <Card label={`Order from ${seller.name}`}>
      <CardHeader>
        <div className="tl-card__title-row">
          <strong>{seller.name}</strong>
          <span>{total}</span>
        </div>
      </CardHeader>
      <CardBody>
        <div className="tl-stack">
          {/* position: relative keeps the table's visually-hidden labels (absolutely
              positioned) inside this scroller; without it they widen the page on a phone. */}
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table className="tl-table">
              <caption className="tl-visually-hidden">Items from {seller.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Price</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Amount</th>
                  <th scope="col">
                    <span className="tl-visually-hidden">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <LineRow key={`${line.id}:${line.quantity}`} line={line} />
                ))}
              </tbody>
            </table>
          </div>
          {problems > 0 ? (
            <Alert tone="warning">Fix or remove the {problems === 1 ? 'item' : `${problems} items`} marked above before ordering.</Alert>
          ) : !emailVerified ? (
            <Alert tone="info">Verify your email address before ordering, so the seller can reach you about the order.</Alert>
          ) : (
            <form onSubmit={place} className="tl-stack" noValidate aria-label={`Delivery for ${seller.name}`}>
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Deliver to (name)" required>
                  {(props) => <Input {...props} maxLength={120} value={form.deliveryName} onChange={set('deliveryName')} />}
                </Field>
                <Field label="Phone for delivery" required>
                  {(props) => <Input {...props} type="tel" maxLength={20} value={form.deliveryPhone} onChange={set('deliveryPhone')} />}
                </Field>
              </div>
              <Field label="Delivery address" required>
                {(props) => <textarea {...props} className="tl-input" rows={2} maxLength={500} value={form.deliveryAddress} onChange={set('deliveryAddress')} />}
              </Field>
              <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="District" required>
                  {(props) => (
                    <select {...props} className="tl-input" value={form.deliveryDistrictId} onChange={set('deliveryDistrictId')}>
                      <option value="">Choose…</option>
                      {districts.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {organizations.length > 0 ? (
                  <Field label="Buying for (optional)">
                    {(props) => (
                      <select {...props} className="tl-input" value={form.buyerOrganizationId} onChange={set('buyerOrganizationId')}>
                        <option value="">Myself</option>
                        {organizations.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                ) : null}
                <Field label="Your GSTIN, for a business invoice (optional)">
                  {(props) => <Input {...props} maxLength={15} value={form.buyerTaxIdentifier} onChange={set('buyerTaxIdentifier')} />}
                </Field>
              </div>
              <Field label="Note to the seller (optional)">
                {(props) => <textarea {...props} className="tl-input" rows={2} maxLength={1000} value={form.buyerNote} onChange={set('buyerNote')} />}
              </Field>
              <p className="tl-muted" style={{ margin: 0 }}>
                {seller.name} will see your name, phone and delivery address. You pay {seller.name} directly after it confirms; no payment is taken now.
              </p>
              <div>
                <Button type="submit" loading={busy}>
                  Place order
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
