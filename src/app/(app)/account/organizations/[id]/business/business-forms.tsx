/**
 * The business console's forms: trading profile with service districts,
 * returns and payment instructions; a new product or service; and per item:
 * price, tax rate and code, minimum, description, whether buyers may order it
 * at the listed price, its variants, publish/archive. Prices are entered in
 * rupees and sent in paise.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Field, Input } from '@/design-system';
import { api, newIdempotencyKey } from '@/lib/api-client';

type Notice = { tone: 'success' | 'danger'; text: string } | null;
type Category = { key: string; label: string; kind: 'GOOD' | 'SERVICE' };

const TAX_RATES = ['0', '5', '12', '18', '28'] as const;

const toPaise = (rupees: string) => {
  const n = Number(rupees.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : null;
};

export function BusinessProfileForm({
  organizationId,
  isLaboratory,
  categories,
  districts,
  profile,
}: {
  organizationId: string;
  isLaboratory: boolean;
  categories: readonly Category[];
  districts: ReadonlyArray<{ id: string; label: string }>;
  profile: {
    categories: string[];
    brands: string;
    gstin: string;
    establishedYear: string;
    deliveryNote: string;
    minimumOrderNote: string;
    turnaroundDays: string;
    servesAllIndia: boolean;
    serviceDistrictIds: string[];
    returnWindowDays: string;
    paymentInstructions: string;
  };
}) {
  const router = useRouter();
  const [values, setValues] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const toggle = (key: 'categories' | 'serviceDistrictIds', value: string, on: boolean) => setValues((v) => ({ ...v, [key]: on ? [...v[key], value] : v[key].filter((x) => x !== value) }));
  const text =
    (key: 'brands' | 'gstin' | 'establishedYear' | 'deliveryNote' | 'minimumOrderNote' | 'turnaroundDays' | 'returnWindowDays' | 'paymentInstructions') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value }));
  const orNull = (s: string) => (s.trim() ? s.trim() : null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    const result = await api.patch(`/api/v1/organizations/${organizationId}/business`, {
      categories: values.categories,
      brands: values.brands.split(',').map((b) => b.trim()).filter(Boolean),
      gstin: orNull(values.gstin)?.toUpperCase() ?? null,
      establishedYear: values.establishedYear.trim() ? Number(values.establishedYear) : null,
      deliveryNote: orNull(values.deliveryNote),
      minimumOrderNote: orNull(values.minimumOrderNote),
      ...(isLaboratory ? { turnaroundDays: values.turnaroundDays.trim() ? Number(values.turnaroundDays) : null } : {}),
      servesAllIndia: values.servesAllIndia,
      serviceDistrictIds: values.servesAllIndia ? [] : values.serviceDistrictIds,
      returnWindowDays: values.returnWindowDays.trim() ? Number(values.returnWindowDays) : 0,
      paymentInstructions: orNull(values.paymentInstructions),
    });
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Saved.' });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <fieldset className="tl-fieldset">
        <legend className="tl-fieldset__legend">You deal in</legend>
        <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
          {categories.map((c) => (
            <label key={c.key} className="tl-checkbox">
              <input type="checkbox" checked={values.categories.includes(c.key)} onChange={(e) => toggle('categories', c.key, e.target.checked)} />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Brands (optional)" hint="Separate with commas.">
        {(props) => <Input {...props} value={values.brands} onChange={text('brands')} />}
      </Field>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="GSTIN (optional)">
          {(props) => <Input {...props} maxLength={15} value={values.gstin} onChange={text('gstin')} />}
        </Field>
        <Field label="Established (year)">
          {(props) => <Input {...props} inputMode="numeric" maxLength={4} value={values.establishedYear} onChange={text('establishedYear')} />}
        </Field>
        {isLaboratory ? (
          <Field label="Usual turnaround (working days)">
            {(props) => <Input {...props} inputMode="numeric" value={values.turnaroundDays} onChange={text('turnaroundDays')} />}
          </Field>
        ) : null}
      </div>
      <Field label="Delivery (optional)" hint="For example “Free delivery in Raipur within 2 days”.">
        {(props) => <Input {...props} maxLength={300} value={values.deliveryNote} onChange={text('deliveryNote')} />}
      </Field>
      <Field label="Minimum order (optional)">
        {(props) => <Input {...props} maxLength={200} value={values.minimumOrderNote} onChange={text('minimumOrderNote')} />}
      </Field>
      <Field label="How buyers pay you (optional)" hint="Your bank account or UPI id, as you want buyers to see it once you confirm their order. Toothlogy takes no payment.">
        {(props) => <textarea {...props} className="tl-input" rows={2} maxLength={500} value={values.paymentInstructions} onChange={text('paymentInstructions')} />}
      </Field>
      <Field label="Returns accepted for (days after delivery)" hint="0 means you do not take returns through Toothlogy.">
        {(props) => <Input {...props} inputMode="numeric" maxLength={2} value={values.returnWindowDays} onChange={text('returnWindowDays')} />}
      </Field>
      <label className="tl-checkbox">
        <input type="checkbox" checked={values.servesAllIndia} onChange={(e) => setValues((v) => ({ ...v, servesAllIndia: e.target.checked }))} />
        <span>We deliver across India</span>
      </label>
      {!values.servesAllIndia ? (
        <fieldset className="tl-fieldset">
          <legend className="tl-fieldset__legend">Districts you serve</legend>
          <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
            {districts.map((d) => (
              <label key={d.id} className="tl-checkbox">
                <input type="checkbox" checked={values.serviceDistrictIds.includes(d.id)} onChange={(e) => toggle('serviceDistrictIds', d.id, e.target.checked)} />
                <span>{d.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div>
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function TaxRateSelect({ value, onChange, label = 'Tax rate (GST)' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label}>
      {(props) => (
        <select {...props} className="tl-input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          {TAX_RATES.map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function NewProductForm({ organizationId, categories, currency }: { organizationId: string; categories: readonly Category[]; currency: string }) {
  const router = useRouter();
  const [category, setCategory] = useState(categories[0]?.key ?? '');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [rate, setRate] = useState('');
  const [minimum, setMinimum] = useState('1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const kind = categories.find((c) => c.key === category)?.kind ?? 'GOOD';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const paise = price.trim() ? toPaise(price) : null;
    if (price.trim() && paise === null) return setNotice({ tone: 'danger', text: 'Enter the price in rupees, digits only.' });
    setBusy(true);
    const result = await api.post(
      `/api/v1/organizations/${organizationId}/products`,
      {
        kind,
        category,
        name: name.trim(),
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        ...(paise !== null ? { priceMinor: paise } : {}),
        ...(rate ? { gstRatePercent: Number(rate) } : {}),
        minOrderQuantity: Number(minimum) || 1,
      },
      { idempotencyKey: newIdempotencyKey() },
    );
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: 'Added as a draft. Publish it when the details are right.' });
    setName('');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="tl-stack" noValidate>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Category">
          {(props) => (
            <select {...props} className="tl-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Name">
          {(props) => <Input {...props} maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Brand (optional)">
          {(props) => <Input {...props} maxLength={80} value={brand} onChange={(e) => setBrand(e.target.value)} />}
        </Field>
      </div>
      <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Unit (optional)" hint={kind === 'SERVICE' ? 'For example “crown”.' : 'For example “box of 100”.'}>
          {(props) => <Input {...props} maxLength={60} value={unit} onChange={(e) => setUnit(e.target.value)} />}
        </Field>
        <Field label={`Indicative price, ${currency}, GST included (optional)`}>
          {(props) => <Input {...props} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
        <TaxRateSelect value={rate} onChange={setRate} />
        <Field label="Minimum order">
          {(props) => <Input {...props} inputMode="numeric" value={minimum} onChange={(e) => setMinimum(e.target.value)} />}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={busy} disabled={name.trim().length < 3}>
          Add to catalogue
        </Button>
      </div>
    </form>
  );
}

interface VariantView {
  id: string;
  label: string;
  sku: string;
  priceRupees: string;
  available: boolean;
  status: string;
}

function Variants({ productId, variants }: { productId: string; variants: readonly VariantView[] }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function add() {
    const paise = toPaise(price);
    if (!label.trim() || paise === null || !price.trim()) return setNotice({ tone: 'danger', text: 'Name the variant and give its price in rupees.' });
    setBusy('add');
    setNotice(null);
    const result = await api.post(`/api/v1/products/${productId}/variants`, { label: label.trim(), priceMinor: paise, ...(sku.trim() ? { sku: sku.trim() } : {}) }, { idempotencyKey: newIdempotencyKey() });
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setLabel('');
    setSku('');
    setPrice('');
    setNotice({ tone: 'success', text: 'Variant added.' });
    router.refresh();
  }
  async function change(id: string, body: Record<string, unknown>, done: string) {
    setBusy(id);
    setNotice(null);
    const result = await api.patch(`/api/v1/variants/${id}`, body);
    setBusy(null);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    router.refresh();
  }

  return (
    <fieldset className="tl-fieldset">
      <legend className="tl-fieldset__legend">Variants (sizes, shades, packs)</legend>
      <div className="tl-stack">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
        {variants.length > 0 ? (
          <ul className="tl-list" aria-label="Variants">
            {variants.map((v) => (
              <li key={v.id} className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span>
                  <strong>{v.label}</strong> · ₹{v.priceRupees}
                  {v.sku ? ` · ${v.sku}` : ''}
                </span>
                {v.status !== 'ACTIVE' ? <Badge tone="neutral">off sale</Badge> : !v.available ? <Badge tone="warning">out of stock</Badge> : null}
                {v.status === 'ACTIVE' ? (
                  <>
                    <Button size="sm" variant="ghost" loading={busy === v.id} onClick={() => change(v.id, { available: !v.available }, v.available ? 'Marked out of stock.' : 'Back in stock.')}>
                      {v.available ? 'Out of stock' : 'In stock'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => change(v.id, { status: 'ARCHIVED' }, 'Taken off sale.')}>
                      Take off sale
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => change(v.id, { status: 'ACTIVE' }, 'Back on sale.')}>
                    Put back on sale
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Variant">{(props) => <Input {...props} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <Field label="SKU (optional)">{(props) => <Input {...props} maxLength={40} value={sku} onChange={(e) => setSku(e.target.value)} />}</Field>
          <Field label="Variant price (rupees, GST included)">{(props) => <Input {...props} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
          <Button size="sm" variant="secondary" loading={busy === 'add'} onClick={add}>
            Add variant
          </Button>
        </div>
      </div>
    </fieldset>
  );
}

export function ProductEditor({
  product,
}: {
  product: { id: string; status: string; priceRupees: string; minOrderQuantity: string; description: string; orderable: boolean; gstRatePercent: string; taxCode: string; variants: readonly VariantView[] };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(product.priceRupees);
  const [minimum, setMinimum] = useState(product.minOrderQuantity);
  const [description, setDescription] = useState(product.description);
  const [rate, setRate] = useState(product.gstRatePercent);
  const [taxCode, setTaxCode] = useState(product.taxCode);
  const [orderable, setOrderable] = useState(product.orderable);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setNotice(null);
    const result = await api.patch(`/api/v1/products/${product.id}`, body);
    setBusy(false);
    if (!result.ok) return setNotice({ tone: 'danger', text: result.message });
    setNotice({ tone: 'success', text: done });
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="tl-stack">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <div className="tl-inline" style={{ flexWrap: 'wrap' }}>
        {product.status !== 'PUBLISHED' ? (
          <Button size="sm" loading={busy && !editing} onClick={() => patch({ status: 'PUBLISHED' }, 'Published: buyers can see it and ask for a quote.')}>
            Publish
          </Button>
        ) : (
          <Button size="sm" variant="ghost" loading={busy && !editing} onClick={() => patch({ status: 'ARCHIVED' }, 'Archived: no longer shown.')}>
            Archive
          </Button>
        )}
        <Button size="sm" variant="secondary" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
          Edit
        </Button>
      </div>
      {editing ? (
        <div className="tl-stack">
          <div className="tl-inline" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label="Price (rupees)">
              {(props) => <Input {...props} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}
            </Field>
            <TaxRateSelect value={rate} onChange={setRate} />
            <Field label="HSN/SAC code (optional)">
              {(props) => <Input {...props} maxLength={20} value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />}
            </Field>
            <Field label="Minimum order">
              {(props) => <Input {...props} inputMode="numeric" value={minimum} onChange={(e) => setMinimum(e.target.value)} />}
            </Field>
          </div>
          <Field label="Description">
            {(props) => <textarea {...props} className="tl-input" rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />}
          </Field>
          <label className="tl-checkbox">
            <input type="checkbox" checked={orderable} onChange={(e) => setOrderable(e.target.checked)} />
            <span>Buyers can order it at the listed price (otherwise they ask for a quote)</span>
          </label>
          <div>
            <Button
              size="sm"
              loading={busy}
              onClick={() => {
                const paise = price.trim() ? toPaise(price) : null;
                if (price.trim() && paise === null) return setNotice({ tone: 'danger', text: 'Enter the price in rupees, digits only.' });
                void patch(
                  { priceMinor: paise, minOrderQuantity: Number(minimum) || 1, description: description.trim() || null, gstRatePercent: rate === '' ? null : Number(rate), taxCode: taxCode.trim() || null, orderable },
                  'Saved.',
                );
              }}
            >
              Save
            </Button>
          </div>
          <Variants productId={product.id} variants={product.variants} />
        </div>
      ) : null}
    </div>
  );
}
