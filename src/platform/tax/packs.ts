/**
 * TOOTHLOGY TAX PACKS — how a country's tax appears on an invoice
 *
 * The rate comes from what is sold (a product's rate, or TaxConfiguration).
 * A pack decides the rest, per tax regime: how that tax splits into
 * components and what they are called, which fiscal year a date falls in
 * (document numbers restart each year), what a tax identifier looks like,
 * and what the documents are titled.
 *
 * India's GST pack is here because India is the launch market. A new market
 * adds a pack; the order service never branches on a country (Constitution P5).
 *
 * All arithmetic is in integer minor units; nothing is ever a float.
 */

import type { TaxRegime } from '@prisma/client';

export interface TaxComponent {
  readonly label: string;
  readonly rateBasisPoints: number;
  readonly amountMinor: bigint;
}

/** Where the seller is registered and where the supply goes (region names). */
export interface SupplyContext {
  readonly sellerRegion: string;
  readonly placeOfSupply: string;
}

export interface TaxPack {
  readonly regime: TaxRegime;
  /** What the tax identifier is called ("GSTIN", "VAT number"); null when there is none. */
  readonly taxIdentifierLabel: string | null;
  /** What a line's tax classification code is called ("HSN/SAC"); null when unused. */
  readonly taxCodeLabel: string | null;
  validTaxIdentifier(value: string): boolean;
  /** The fiscal year a moment falls in, as a label ("2026-27", "2026"). */
  fiscalYear(at: Date): string;
  /** The pack's classification of a supply, or null when the regime has none. */
  supplyKind(context: SupplyContext): string | null;
  /** Split one line's tax into its components. The components sum to `taxMinor`. */
  split(taxMinor: bigint, rateBasisPoints: number, context: SupplyContext): TaxComponent[];
  documentTitle(kind: 'INVOICE' | 'CREDIT_NOTE'): string;
}

const TEN_THOUSAND = BigInt(10_000);

/** "9%", "2.5%", "18%" from basis points. */
export function formatRate(rateBasisPoints: number): string {
  return `${(rateBasisPoints / 100).toString()}%`;
}

/**
 * A tax-inclusive line: its gross (unit price × quantity), the net inside it
 * (rounded half up) and the tax, which is exactly the difference — so net and
 * tax always add back to what the buyer was shown.
 */
export function lineAmounts(unitPriceMinor: bigint, quantity: number, rateBasisPoints: number): { grossMinor: bigint; netMinor: bigint; taxMinor: bigint } {
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError('Quantity must be a whole number of at least 1.');
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) throw new RangeError('A tax rate is a non-negative whole number of basis points.');
  const grossMinor = unitPriceMinor * BigInt(quantity);
  const divisor = TEN_THOUSAND + BigInt(rateBasisPoints);
  const netMinor = (grossMinor * TEN_THOUSAND + divisor / BigInt(2)) / divisor;
  return { grossMinor, netMinor, taxMinor: grossMinor - netMinor };
}

const normalise = (region: string) => region.toLowerCase().replace(/[^a-z]/g, '');

// ---------------------------------------------------------------------------
// India — GST
// ---------------------------------------------------------------------------

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Union territories without a legislature levy UTGST where a state levies
 * SGST. Matched on normalised names, so "Dadra & Nagar Haveli and Daman & Diu"
 * and its other spellings agree.
 */
const UTGST_TERRITORIES = new Set(
  ['Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Ladakh', 'Lakshadweep'].map(normalise),
);

const indiaGst: TaxPack = {
  regime: 'GST',
  taxIdentifierLabel: 'GSTIN',
  taxCodeLabel: 'HSN/SAC',
  validTaxIdentifier: (value) => GSTIN.test(value.trim().toUpperCase()),
  fiscalYear(at) {
    // April to March, in India's (single) time zone, UTC+05:30.
    const local = new Date(at.getTime() + 330 * 60_000);
    const year = local.getUTCMonth() >= 3 ? local.getUTCFullYear() : local.getUTCFullYear() - 1;
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  },
  supplyKind: ({ sellerRegion, placeOfSupply }) => (normalise(sellerRegion) === normalise(placeOfSupply) ? 'INTRA_STATE' : 'INTER_STATE'),
  split(taxMinor, rateBasisPoints, context) {
    if (rateBasisPoints === 0) return [];
    if (indiaGst.supplyKind(context) === 'INTER_STATE') return [{ label: 'IGST', rateBasisPoints, amountMinor: taxMinor }];
    const central = taxMinor / BigInt(2);
    const half = rateBasisPoints / 2;
    const local = UTGST_TERRITORIES.has(normalise(context.placeOfSupply)) ? 'UTGST' : 'SGST';
    return [
      { label: 'CGST', rateBasisPoints: half, amountMinor: central },
      { label: local, rateBasisPoints: half, amountMinor: taxMinor - central },
    ];
  },
  documentTitle: (kind) => (kind === 'INVOICE' ? 'Tax invoice' : 'Credit note'),
};

// ---------------------------------------------------------------------------
// Single-component regimes
// ---------------------------------------------------------------------------

function singleTax(regime: TaxRegime, label: string, identifierLabel: string | null): TaxPack {
  return {
    regime,
    taxIdentifierLabel: identifierLabel,
    taxCodeLabel: null,
    validTaxIdentifier: (value) => /^[A-Z0-9-]{5,20}$/.test(value.trim().toUpperCase()),
    fiscalYear: (at) => String(at.getUTCFullYear()),
    supplyKind: () => null,
    split: (taxMinor, rateBasisPoints) => (rateBasisPoints === 0 ? [] : [{ label, rateBasisPoints, amountMinor: taxMinor }]),
    documentTitle: (kind) => (kind === 'INVOICE' ? 'Invoice' : 'Credit note'),
  };
}

const PACKS: Readonly<Record<TaxRegime, TaxPack>> = {
  GST: indiaGst,
  VAT: singleTax('VAT', 'VAT', 'VAT number'),
  SALES_TAX: singleTax('SALES_TAX', 'Sales tax', 'Tax ID'),
  NONE: { ...singleTax('NONE', 'Tax', null), split: () => [], validTaxIdentifier: () => false },
};

export function taxPackFor(regime: TaxRegime): TaxPack {
  return PACKS[regime];
}

/** Sum components by label across lines, keeping the first-seen order. */
export function totalByComponent(lines: ReadonlyArray<ReadonlyArray<TaxComponent>>): Array<{ label: string; rateBasisPoints: number; amountMinor: bigint }> {
  const totals = new Map<string, { label: string; rateBasisPoints: number; amountMinor: bigint }>();
  for (const components of lines) {
    for (const c of components) {
      const key = `${c.label}@${c.rateBasisPoints}`;
      const prior = totals.get(key);
      totals.set(key, { label: c.label, rateBasisPoints: c.rateBasisPoints, amountMinor: (prior?.amountMinor ?? BigInt(0)) + c.amountMinor });
    }
  }
  return [...totals.values()];
}
