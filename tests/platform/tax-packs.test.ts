/**
 * TL-TEST-TAX-PACKS-001 — tax packs: GST split and labels, fiscal years,
 * identifiers, single-component regimes, and tax-inclusive line arithmetic.
 */

import { describe, expect, it } from 'vitest';
import { formatRate, lineAmounts, taxPackFor, totalByComponent } from '@/platform/tax/packs';

const B = (n: number) => BigInt(n);

describe('tax-inclusive lines', () => {
  it('splits a gross line into net and tax that add back exactly', () => {
    expect(lineAmounts(B(45_000), 5, 1800)).toEqual({ grossMinor: B(225_000), netMinor: B(190_678), taxMinor: B(34_322) });
    expect(lineAmounts(B(10_000), 1, 0)).toEqual({ grossMinor: B(10_000), netMinor: B(10_000), taxMinor: B(0) });
    for (const [price, qty, rate] of [[1, 1, 1800], [99_999, 7, 1200], [333, 3, 500], [100, 1, 2800]] as const) {
      const { grossMinor, netMinor, taxMinor } = lineAmounts(B(price), qty, rate);
      expect(netMinor + taxMinor).toBe(grossMinor);
    }
    expect(() => lineAmounts(B(100), 0, 1800)).toThrow(RangeError);
    expect(() => lineAmounts(B(100), 1, -1)).toThrow(RangeError);
  });

  it('formats rates from basis points', () => {
    expect(formatRate(1800)).toBe('18%');
    expect(formatRate(900)).toBe('9%');
    expect(formatRate(250)).toBe('2.5%');
  });
});

describe('India GST pack', () => {
  const gst = taxPackFor('GST');

  it('splits within a state into CGST + SGST, and between states into IGST', () => {
    const within = { sellerRegion: 'Chhattisgarh', placeOfSupply: 'chhattisgarh' };
    expect(gst.supplyKind(within)).toBe('INTRA_STATE');
    expect(gst.split(B(34_323), 1800, within)).toEqual([
      { label: 'CGST', rateBasisPoints: 900, amountMinor: B(17_161) },
      { label: 'SGST', rateBasisPoints: 900, amountMinor: B(17_162) },
    ]);
    const between = { sellerRegion: 'Chhattisgarh', placeOfSupply: 'Maharashtra' };
    expect(gst.supplyKind(between)).toBe('INTER_STATE');
    expect(gst.split(B(34_323), 1800, between)).toEqual([{ label: 'IGST', rateBasisPoints: 1800, amountMinor: B(34_323) }]);
    expect(gst.split(B(0), 0, within)).toEqual([]);
  });

  it('uses UTGST in union territories without a legislature', () => {
    const chandigarh = { sellerRegion: 'Chandigarh', placeOfSupply: 'Chandigarh' };
    expect(gst.split(B(100), 1200, chandigarh).map((c) => c.label)).toEqual(['CGST', 'UTGST']);
    const delhi = { sellerRegion: 'Delhi', placeOfSupply: 'Delhi' };
    expect(gst.split(B(100), 1200, delhi).map((c) => c.label)).toEqual(['CGST', 'SGST']);
  });

  it('numbers by April–March fiscal year in India time', () => {
    expect(gst.fiscalYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('2026-27');
    expect(gst.fiscalYear(new Date('2026-03-31T23:59:00+05:30'))).toBe('2025-26');
    // 31 March 20:00 UTC is already 1 April in India.
    expect(gst.fiscalYear(new Date('2027-03-31T20:00:00Z'))).toBe('2027-28');
    expect(gst.fiscalYear(new Date('2099-06-01T00:00:00Z'))).toBe('2099-00');
  });

  it('checks GSTINs and titles its documents', () => {
    expect(gst.validTaxIdentifier('22aaaaa0000a1z5')).toBe(true);
    expect(gst.validTaxIdentifier('22AAAAA0000A1Z')).toBe(false);
    expect(gst.documentTitle('INVOICE')).toBe('Tax invoice');
    expect(gst.taxIdentifierLabel).toBe('GSTIN');
    expect(gst.taxCodeLabel).toBe('HSN/SAC');
  });
});

describe('other regimes', () => {
  it('shows VAT as one component on a calendar fiscal year', () => {
    const vat = taxPackFor('VAT');
    expect(vat.split(B(2000), 2000, { sellerRegion: 'Bavaria', placeOfSupply: 'Hesse' })).toEqual([{ label: 'VAT', rateBasisPoints: 2000, amountMinor: B(2000) }]);
    expect(vat.fiscalYear(new Date('2026-12-31T12:00:00Z'))).toBe('2026');
    expect(vat.supplyKind({ sellerRegion: 'a', placeOfSupply: 'b' })).toBeNull();
    expect(vat.documentTitle('INVOICE')).toBe('Invoice');
  });

  it('has no tax components or identifiers where there is no tax', () => {
    const none = taxPackFor('NONE');
    expect(none.split(B(500), 1000, { sellerRegion: 'a', placeOfSupply: 'a' })).toEqual([]);
    expect(none.validTaxIdentifier('ANYTHING1')).toBe(false);
  });

  it('totals components across lines by label and rate', () => {
    const gst = taxPackFor('GST');
    const ctx = { sellerRegion: 'Chhattisgarh', placeOfSupply: 'Chhattisgarh' };
    const totals = totalByComponent([gst.split(B(100), 1800, ctx), gst.split(B(51), 1800, ctx), gst.split(B(40), 1200, ctx)]);
    expect(totals).toEqual([
      { label: 'CGST', rateBasisPoints: 900, amountMinor: B(75) },
      { label: 'SGST', rateBasisPoints: 900, amountMinor: B(76) },
      { label: 'CGST', rateBasisPoints: 600, amountMinor: B(20) },
      { label: 'SGST', rateBasisPoints: 600, amountMinor: B(20) },
    ]);
  });
});
