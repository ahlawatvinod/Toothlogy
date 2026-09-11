/** Ask a business for a quote on one of its products or services. */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

export function QuoteRequestForm({ sellerName, products, organizations }: { sellerName: string; products: ReadonlyArray<{ id: string; label: string; minimum: number }>; organizations: ReadonlyArray<{ id: string; name: string }> }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const minimum = products.find((p) => p.id === productId)?.minimum ?? 1;
  const [quantity, setQuantity] = useState(String(minimum));
  const [buyerOrganizationId, setBuyerOrganizationId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < minimum) return setError(`Enter a whole number of at least ${minimum}.`);
    setBusy(true);
    const result = await api.post(`/api/v1/products/${productId}/quotes`, { quantity: n, ...(buyerOrganizationId ? { buyerOrganizationId } : {}), ...(message.trim() ? { message: message.trim() } : {}) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="success" title="Quote requested">
        {sellerName} can now see your request and contact details. Follow it under <Link href="/account/quotes">My quotes</Link>.
      </Alert>
    );
  }
  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Item" required>
        {(props) => (
          <select {...props} className="tl-input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Quantity" required hint={minimum > 1 ? `Minimum ${minimum}.` : undefined}>
          {(props) => <Input {...props} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
        </Field>
        {organizations.length > 0 ? (
          <Field label="Buying for (optional)">
            {(props) => (
              <select {...props} className="tl-input" value={buyerOrganizationId} onChange={(e) => setBuyerOrganizationId(e.target.value)}>
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
      </div>
      <Field label="Details (optional)" hint="Shade, size, delivery date — anything the seller needs to quote.">
        {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </Field>
      <p className="tl-muted" style={{ margin: 0 }}>
        {sellerName} will see your name, email and phone number to reply. No payment is taken on Toothlogy.
      </p>
      <div>
        <Button type="submit" loading={busy} disabled={!productId}>
          Request a quote
        </Button>
      </div>
    </form>
  );
}
