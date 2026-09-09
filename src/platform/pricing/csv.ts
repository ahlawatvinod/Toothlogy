/**
 * TOOTHLOGY PRICE LIST CSV
 *
 * Import and export of a dentist's price list.
 *
 * WHY A HAND-WRITTEN PARSER
 * The format needed here is one table with quoted fields — RFC 4180. A CSV
 * dependency would bring a parser, a stringifier, a stream API and a transform
 * pipeline to serve about sixty lines of requirement, on a health platform
 * where every dependency is supply chain. The rules below are the whole of
 * RFC 4180 that matters: quoted fields, doubled quotes inside them, and commas
 * and newlines surviving inside quotes.
 *
 * AMOUNTS ARE WRITTEN IN MAJOR UNITS
 * The file a dentist opens in a spreadsheet says `12000.00`, not `1200000`.
 * Minor units are correct inside the system and unreadable outside it, and a
 * dentist checking their own export must be able to see that a crown is twelve
 * thousand rupees. Conversion happens here, once, in both directions.
 *
 * IMPORT NEVER PARTIALLY APPLIES
 * `parsePriceCsv` returns rows AND errors and applies nothing. The caller
 * validates the whole file and rejects it as a unit. A half-imported price
 * list is worse than a failed import: nobody knows which half is live.
 */

import { fromDecimal, toDecimal } from '../money';

export const CSV_COLUMNS = [
  'category',
  'service',
  'variant',
  'unit',
  'min_price',
  'max_price',
  'price',
  'discounted_price',
  'currency',
  'custom_quote',
  'enabled',
  'public',
  'note',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export interface PriceCsvRow {
  readonly category: string;
  readonly service: string;
  readonly variant: string;
  readonly unit: string;
  readonly minMinor: bigint | null;
  readonly maxMinor: bigint | null;
  readonly actualMinor: bigint | null;
  readonly discountedMinor: bigint | null;
  readonly currency: string;
  readonly isCustomQuote: boolean;
  readonly isEnabled: boolean;
  readonly isPublicVisible: boolean;
  readonly note: string;
  /** 1-based line in the source file, for error messages a human can act on. */
  readonly line: number;
}

export interface CsvError {
  readonly line: number;
  readonly column: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

function escapeField(value: string): string {
  // Quote only when required. Quoting everything is valid but makes a diff of
  // two exports unreadable, and dentists do compare them.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function amountToMajor(minor: bigint | null, currency: string): string {
  if (minor === null) return '';
  return toDecimal({ amountMinor: minor, currency });
}

export interface ExportableRow {
  readonly category: string;
  readonly service: string;
  readonly variant: string | null;
  readonly unit: string;
  readonly minMinor: bigint | null;
  readonly maxMinor: bigint | null;
  readonly actualMinor: bigint | null;
  readonly discountedMinor: bigint | null;
  readonly currency: string;
  readonly isCustomQuote: boolean;
  readonly isEnabled: boolean;
  readonly isPublicVisible: boolean;
  readonly note: string | null;
}

export function serializePriceCsv(rows: readonly ExportableRow[]): string {
  const lines: string[] = [CSV_COLUMNS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.category,
        row.service,
        row.variant ?? '',
        row.unit,
        amountToMajor(row.minMinor, row.currency),
        amountToMajor(row.maxMinor, row.currency),
        amountToMajor(row.actualMinor, row.currency),
        amountToMajor(row.discountedMinor, row.currency),
        row.currency,
        row.isCustomQuote ? 'yes' : 'no',
        row.isEnabled ? 'yes' : 'no',
        row.isPublicVisible ? 'yes' : 'no',
        row.note ?? '',
      ]
        .map((field) => escapeField(String(field)))
        .join(','),
    );
  }

  // CRLF is what RFC 4180 specifies and what Excel expects on Windows; every
  // other reader accepts it.
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Split CSV text into rows of fields, honouring quotes. */
export function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // A byte-order mark at the start of a spreadsheet export would otherwise
  // become part of the first column name and break every header lookup.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < source.length) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      // Consume CRLF as one terminator, not two.
      i += char === '\r' && source[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing blank lines, which every spreadsheet adds.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function parseBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === '') return fallback;
  return ['yes', 'y', 'true', '1'].includes(normalized);
}

export interface ParseResult {
  readonly rows: readonly PriceCsvRow[];
  readonly errors: readonly CsvError[];
}

/**
 * Parse a price-list CSV.
 *
 * Returns rows and errors together and applies nothing. A file with any error
 * should be rejected whole by the caller — see the note at the top.
 */
export function parsePriceCsv(text: string, defaultCurrency = 'INR'): ParseResult {
  const grid = parseCsvGrid(text);
  const errors: CsvError[] = [];

  if (grid.length === 0) {
    return { rows: [], errors: [{ line: 1, column: 'file', message: 'The file is empty.' }] };
  }

  const header = (grid[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const index = new Map(header.map((name, position) => [name, position]));

  for (const required of ['service', 'currency'] as const) {
    if (!index.has(required)) {
      errors.push({
        line: 1,
        column: required,
        message: `The file needs a '${required}' column. Export your current price list to get a file with the right columns.`,
      });
    }
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: PriceCsvRow[] = [];

  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r] ?? [];
    // +1 because the header is line 1 and a dentist counts lines the way their
    // spreadsheet does.
    const line = r + 1;
    const cell = (column: CsvColumn): string => {
      const position = index.get(column);
      return position === undefined ? '' : (cells[position] ?? '').trim();
    };

    const service = cell('service');
    if (!service) {
      errors.push({ line, column: 'service', message: 'The service name is missing.' });
      continue;
    }

    const currency = (cell('currency') || defaultCurrency).toUpperCase();

    const amount = (column: CsvColumn): bigint | null => {
      const raw = cell(column);
      if (!raw) return null;
      try {
        // Strip grouping separators and a currency symbol, which every
        // spreadsheet adds back when a column is formatted as currency.
        const cleaned = raw.replace(/[₹,\s]/g, '');
        return fromDecimal(cleaned, currency).amountMinor;
      } catch {
        errors.push({
          line,
          column,
          message: `'${raw}' is not an amount. Write it as a plain number, for example 12000 or 12000.00.`,
        });
        return null;
      }
    };

    rows.push({
      category: cell('category'),
      service,
      variant: cell('variant'),
      unit: cell('unit'),
      minMinor: amount('min_price'),
      maxMinor: amount('max_price'),
      actualMinor: amount('price'),
      discountedMinor: amount('discounted_price'),
      currency,
      isCustomQuote: parseBoolean(cell('custom_quote'), false),
      isEnabled: parseBoolean(cell('enabled'), true),
      isPublicVisible: parseBoolean(cell('public'), true),
      note: cell('note'),
      line,
    });
  }

  return { rows, errors };
}
