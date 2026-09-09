/**
 * Price list CSV import and export (specification §16).
 */

import { describe, expect, it } from 'vitest';
import {
  CSV_COLUMNS,
  parseCsvGrid,
  parsePriceCsv,
  serializePriceCsv,
  type ExportableRow,
} from '@/platform/pricing/csv';

const r = (rupees: number) => BigInt(rupees) * 100n;

const exportable = (overrides: Partial<ExportableRow> = {}): ExportableRow => ({
  category: 'Crowns & Bridges',
  service: 'Crown',
  variant: 'Zirconia',
  unit: 'per_crown',
  minMinor: null,
  maxMinor: null,
  actualMinor: r(12000),
  discountedMinor: null,
  currency: 'INR',
  isCustomQuote: false,
  isEnabled: true,
  isPublicVisible: true,
  note: null,
  ...overrides,
});

describe('parseCsvGrid', () => {
  it('handles quoted fields containing commas', () => {
    const grid = parseCsvGrid('a,"b,c",d');
    expect(grid[0]).toEqual(['a', 'b,c', 'd']);
  });

  it('handles doubled quotes inside a quoted field', () => {
    expect(parseCsvGrid('"say ""hi"""')[0]).toEqual(['say "hi"']);
  });

  it('handles newlines inside a quoted field', () => {
    const grid = parseCsvGrid('a,"line1\nline2"\nb,c');
    expect(grid).toHaveLength(2);
    expect(grid[0]?.[1]).toBe('line1\nline2');
  });

  it('treats CRLF as one line terminator', () => {
    expect(parseCsvGrid('a,b\r\nc,d')).toHaveLength(2);
  });

  it('strips a byte-order mark, which would otherwise corrupt the first header', () => {
    expect(parseCsvGrid('﻿service,currency')[0]?.[0]).toBe('service');
  });

  it('drops trailing blank lines that spreadsheets add', () => {
    expect(parseCsvGrid('a,b\r\nc,d\r\n\r\n')).toHaveLength(2);
  });
});

describe('serializePriceCsv', () => {
  it('writes amounts in major units, which is what a dentist reads', () => {
    const csv = serializePriceCsv([exportable()]);
    expect(csv).toContain('12000.00');
    expect(csv).not.toContain('1200000');
  });

  it('writes the agreed header', () => {
    expect(serializePriceCsv([]).trim()).toBe(CSV_COLUMNS.join(','));
  });

  it('quotes only the fields that need it', () => {
    const csv = serializePriceCsv([exportable({ note: 'Depends on canals, per tooth' })]);
    expect(csv).toContain('"Depends on canals, per tooth"');
    expect(csv).toContain('Crown,Zirconia');
  });

  it('round-trips through the parser without losing an amount', () => {
    const csv = serializePriceCsv([exportable({ discountedMinor: r(10999) })]);
    const { rows, errors } = parsePriceCsv(csv);
    expect(errors).toEqual([]);
    expect(rows[0]?.actualMinor).toBe(r(12000));
    expect(rows[0]?.discountedMinor).toBe(r(10999));
    expect(rows[0]?.variant).toBe('Zirconia');
  });
});

describe('parsePriceCsv', () => {
  const header = 'category,service,variant,unit,price,currency\r\n';

  it('parses a normal row', () => {
    const { rows, errors } = parsePriceCsv(`${header}Crowns,Crown,Zirconia,per_crown,12000,INR`);
    expect(errors).toEqual([]);
    expect(rows[0]?.actualMinor).toBe(r(12000));
  });

  it('tolerates the grouping and currency symbols a spreadsheet adds back', () => {
    const { rows, errors } = parsePriceCsv(
      `${header}Crowns,Crown,Zirconia,per_crown,"₹12,000.00",INR`,
    );
    expect(errors).toEqual([]);
    expect(rows[0]?.actualMinor).toBe(r(12000));
  });

  it('reports the line number a human can find in their spreadsheet', () => {
    const { errors } = parsePriceCsv(`${header}Crowns,Crown,Z,per_crown,notanumber,INR`);
    expect(errors[0]?.line).toBe(2);
    expect(errors[0]?.column).toBe('price');
  });

  it('rejects a file missing a required column instead of guessing', () => {
    const { rows, errors } = parsePriceCsv('category,price\r\nCrowns,12000');
    expect(rows).toEqual([]);
    expect(errors.map((e) => e.column)).toContain('service');
  });

  it('rejects a row with no service name', () => {
    const { errors } = parsePriceCsv(`${header}Crowns,,Zirconia,per_crown,12000,INR`);
    expect(errors[0]?.column).toBe('service');
  });

  it('reports an empty file rather than returning silently', () => {
    expect(parsePriceCsv('').errors[0]?.message).toContain('empty');
  });

  it('defaults enabled and public to true, and custom quote to false', () => {
    const { rows } = parsePriceCsv(`${header}Crowns,Crown,,per_crown,12000,INR`);
    expect(rows[0]?.isEnabled).toBe(true);
    expect(rows[0]?.isPublicVisible).toBe(true);
    expect(rows[0]?.isCustomQuote).toBe(false);
  });

  it('accepts the boolean spellings a person would actually type', () => {
    const csv =
      'service,currency,enabled\r\nA,INR,yes\r\nB,INR,TRUE\r\nC,INR,1\r\nD,INR,no\r\nE,INR,false';
    const { rows } = parsePriceCsv(csv);
    expect(rows.map((row) => row.isEnabled)).toEqual([true, true, true, false, false]);
  });

  it('collects every error rather than stopping at the first', () => {
    const { errors } = parsePriceCsv(
      `${header}A,Crown,,per_crown,bad,INR\r\nB,,x,per_crown,12000,INR`,
    );
    expect(errors.length).toBeGreaterThan(1);
  });
});
