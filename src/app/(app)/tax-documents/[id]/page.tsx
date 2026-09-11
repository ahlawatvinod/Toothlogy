/**
 * TL-PAGE-TAX-DOCUMENT-001 — /tax-documents/:id
 *
 * A tax invoice or credit note, frozen as issued, laid out by the seller's
 * country tax pack (in India: GSTIN, HSN/SAC, place of supply, CGST and SGST
 * or IGST). Print or save as PDF with the browser, so nothing leaves the
 * device. For the order's buyer or the seller's people; 404 for anyone else.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentPrincipal } from '@/platform/auth/server';
import { isAuthenticated } from '@/platform/rbac';
import { getTaxDocument } from '@/platform/marketplace/orders';
import { formatRate } from '@/platform/tax/packs';
import { formatMoney } from '@/platform/money';
import { isAppError } from '@/platform/kernel/errors';
import { PrintButton } from '@/components/marketplace/print-button';

export const metadata: Metadata = { title: 'Tax document', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  .tl-doc, .tl-doc * { visibility: visible; }
  .tl-doc { position: absolute; inset: 0; padding: 12mm; }
  .tl-no-print { display: none !important; }
}
.tl-doc { min-width: 0; max-width: 100%; }
.tl-doc__scroll { overflow-x: auto; max-width: 100%; position: relative; }
.tl-doc__table { width: 100%; border-collapse: collapse; }
.tl-doc__table th, .tl-doc__table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--tl-color-border, #d8dde3); vertical-align: top; }
.tl-doc__table td.tl-num, .tl-doc__table th.tl-num { text-align: right; white-space: nowrap; }
.tl-doc__parties { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--tl-space-4); }
`;

interface Line {
  name: string;
  variantLabel: string | null;
  taxCode: string | null;
  unit: string | null;
  quantity: number;
  unitPriceMinor: string;
  rateBasisPoints: number;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  components: Array<{ label: string; rateBasisPoints: number; amountMinor: string }>;
}

export default async function TaxDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await currentPrincipal();
  if (!isAuthenticated(principal)) redirect(`/login?next=/tax-documents/${id}`);
  const loaded = await getTaxDocument(principal, id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  });
  if (!loaded) notFound();
  const { document: doc, title, taxIdentifierLabel, taxCodeLabel, againstInvoice } = loaded;
  const money = (n: bigint | string) => formatMoney({ amountMinor: BigInt(n), currency: doc.currency }, 'en-IN');
  const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(doc.issuedAt);
  const lines = doc.lines as unknown as Line[];
  const breakdown = doc.taxBreakdown as unknown as Array<{ label: string; rateBasisPoints: number; amountMinor: string }>;
  const supply = doc.supplyKind === 'INTRA_STATE' ? 'Within the state' : doc.supplyKind === 'INTER_STATE' ? 'Between states' : null;

  return (
    <div className="tl-container tl-page" style={{ maxWidth: '60rem' }}>
      <style>{PRINT_CSS}</style>
      <nav aria-label="Breadcrumb" className="tl-breadcrumb tl-no-print">
        <Link href={`/orders/${doc.orderId}`}>Order {doc.order.number}</Link>
      </nav>
      <article className="tl-doc tl-stack" aria-label={title}>
        <header className="tl-card__title-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="tl-stack">
            <h1 style={{ margin: 0 }}>{title}</h1>
            <span>
              No. <strong>{doc.number}</strong> · {date}
            </span>
            {againstInvoice ? <span>Against tax invoice {againstInvoice}</span> : null}
            <span className="tl-muted">Order {doc.order.number}</span>
          </div>
        </header>
        <div className="tl-doc__parties">
          <section aria-label="Seller">
            <strong>Seller</strong>
            <div>{doc.sellerName}</div>
            {doc.sellerAddress ? <div>{doc.sellerAddress}</div> : null}
            <div>{doc.sellerRegion}</div>
            {taxIdentifierLabel ? (
              <div>
                {taxIdentifierLabel}: {doc.sellerTaxIdentifier ?? 'not registered'}
              </div>
            ) : null}
          </section>
          <section aria-label="Buyer">
            <strong>Buyer</strong>
            <div>{doc.buyerName}</div>
            <div>{doc.buyerAddress}</div>
            {taxIdentifierLabel && doc.buyerTaxIdentifier ? (
              <div>
                {taxIdentifierLabel}: {doc.buyerTaxIdentifier}
              </div>
            ) : null}
            <div>
              Place of supply: {doc.placeOfSupply}
              {supply ? ` (${supply.toLowerCase()})` : ''}
            </div>
          </section>
        </div>
        <div className="tl-doc__scroll">
          <table className="tl-doc__table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                {taxCodeLabel ? <th scope="col">{taxCodeLabel}</th> : null}
                <th scope="col" className="tl-num">
                  Qty
                </th>
                <th scope="col" className="tl-num">
                  Taxable value
                </th>
                <th scope="col">Tax</th>
                <th scope="col" className="tl-num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.name}
                    {l.variantLabel ? ` (${l.variantLabel})` : ''}
                  </td>
                  {taxCodeLabel ? <td>{l.taxCode ?? '—'}</td> : null}
                  <td className="tl-num">
                    {l.quantity}
                    {l.unit ? ` × ${l.unit}` : ''}
                  </td>
                  <td className="tl-num">{money(l.netMinor)}</td>
                  <td>{l.components.length === 0 ? 'Nil' : l.components.map((c) => `${c.label} ${formatRate(c.rateBasisPoints)} ${money(c.amountMinor)}`).join(' · ')}</td>
                  <td className="tl-num">{money(l.grossMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="tl-kv">
          <div>
            <dt>Taxable value</dt>
            <dd>{money(doc.netMinor)}</dd>
          </div>
          {breakdown.map((c) => (
            <div key={`${c.label}${c.rateBasisPoints}`}>
              <dt>
                {c.label} {formatRate(c.rateBasisPoints)}
              </dt>
              <dd>{money(c.amountMinor)}</dd>
            </div>
          ))}
          <div>
            <dt>{doc.kind === 'INVOICE' ? 'Total' : 'Total credited'}</dt>
            <dd>
              <strong>{money(doc.totalMinor)}</strong>
            </dd>
          </div>
        </dl>
        <p className="tl-muted" style={{ margin: 0 }}>
          Issued by {doc.sellerName} through Toothlogy. Toothlogy is not the seller and did not take payment for this order.
        </p>
      </article>
      <div className="tl-no-print">
        <PrintButton />
      </div>
    </div>
  );
}
