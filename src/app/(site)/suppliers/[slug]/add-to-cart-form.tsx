/** Put an item a business sells at a listed price (and its variant) in the cart. */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Field, Input } from '@/design-system';
import { api } from '@/lib/api-client';

interface Item {
  id: string;
  label: string;
  minimum: number;
  variants: ReadonlyArray<{ id: string; label: string; price: string; available: boolean }>;
}

export function AddToCartForm({ items }: { items: readonly Item[] }) {
  const [productId, setProductId] = useState(items[0]?.id ?? '');
  const item = items.find((i) => i.id === productId);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(String(item?.minimum ?? 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setAdded(null);
    if (!item) return;
    const n = Number(quantity);
    if (!Number.isInteger(n) || n < item.minimum) return setError(`Enter a whole number of at least ${item.minimum}.`);
    if (item.variants.length > 0 && !variantId) return setError('Choose a variant.');
    setBusy(true);
    const result = await api.post('/api/v1/me/cart', { productId, ...(variantId ? { variantId } : {}), quantity: n });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setAdded(`${n} × ${item.label}${variantId ? ` (${item.variants.find((v) => v.id === variantId)?.label})` : ''}`);
  }

  return (
    <form onSubmit={submit} className="tl-form" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {added ? (
        <Alert tone="success" title="Added to your cart">
          {added}. <Link href="/cart">Go to the cart</Link> to order.
        </Alert>
      ) : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Item to buy" required>
          {(props) => (
            <select
              {...props}
              className="tl-input"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setVariantId('');
                setQuantity(String(items.find((i) => i.id === e.target.value)?.minimum ?? 1));
              }}
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {item && item.variants.length > 0 ? (
          <Field label="Variant" required>
            {(props) => (
              <select {...props} className="tl-input" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">Choose…</option>
                {item.variants.map((v) => (
                  <option key={v.id} value={v.id} disabled={!v.available}>
                    {v.label} — {v.price}
                    {v.available ? '' : ' (out of stock)'}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field label="How many" required hint={item && item.minimum > 1 ? `Minimum ${item.minimum}.` : undefined}>
          {(props) => <Input {...props} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={busy} disabled={!productId}>
          Add to cart
        </Button>
      </div>
    </form>
  );
}
