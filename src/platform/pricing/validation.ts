/**
 * TOOTHLOGY PRICE VALIDATION
 *
 * The rules that stop a price row from being incoherent.
 *
 * These live here rather than in the Zod schema of each route because several
 * of them are cross-field — a discount is only invalid *relative to* the
 * regular price — and because the same rules have to hold for a CSV import and
 * a bulk percentage change, neither of which goes through a route body schema.
 * One implementation, three entry points.
 *
 * WHY THE MESSAGES ARE WRITTEN THE WAY THEY ARE
 * Each says what is wrong and what the acceptable value looks like. "Invalid
 * price" tells a dentist nothing; "The discounted price must be below the
 * regular price of ₹12,000" tells them exactly what to type instead.
 */

import { z } from 'zod';
import { CURRENCY_BY_CODE } from '@/registry/globalization';
import { formatMoney, money } from '../money';

/** Ten million rupees in paise. */
const MAX_REASONABLE_MINOR = 1_000_000_000n;

export interface PriceFieldsInput {
  readonly minMinor?: bigint | null;
  readonly maxMinor?: bigint | null;
  readonly actualMinor?: bigint | null;
  readonly discountedMinor?: bigint | null;
  readonly packageMinor?: bigint | null;
  readonly additionalMinor?: bigint | null;
  readonly currency: string;
  readonly isCustomQuote?: boolean;
  readonly unitKey?: string | null;
}

export interface PriceIssue {
  readonly field: string;
  readonly message: string;
}

function isPresent(value: bigint | null | undefined): value is bigint {
  return value !== null && value !== undefined;
}

/**
 * Validate one price row.
 *
 * Returns every problem rather than throwing on the first. A dentist correcting
 * a form should see all of what is wrong at once, not discover a second error
 * only after fixing the first.
 */
export function validatePriceFields(input: PriceFieldsInput): readonly PriceIssue[] {
  const issues: PriceIssue[] = [];
  const { currency } = input;

  if (!CURRENCY_BY_CODE.has(currency)) {
    issues.push({
      field: 'currency',
      message: `'${currency}' is not a currency Toothlogy supports.`,
    });
    // Every message below formats an amount in this currency, which would throw.
    return issues;
  }

  const fmt = (amount: bigint) => formatMoney(money(amount, currency));

  const amounts: ReadonlyArray<readonly [string, bigint | null | undefined]> = [
    ['minMinor', input.minMinor],
    ['maxMinor', input.maxMinor],
    ['actualMinor', input.actualMinor],
    ['discountedMinor', input.discountedMinor],
    ['packageMinor', input.packageMinor],
    ['additionalMinor', input.additionalMinor],
  ];

  for (const [field, value] of amounts) {
    if (!isPresent(value)) continue;

    if (value < 0n) {
      issues.push({ field, message: 'A price cannot be negative.' });
    }

    // An upper bound catches the commonest data-entry error by far: entering
    // rupees where paise are expected, or a stray extra zero. Without it a
    // ₹120,000 crown silently becomes ₹12,00,000 on a public page.
    if (value > MAX_REASONABLE_MINOR) {
      issues.push({
        field,
        message: `${fmt(value)} looks wrong — that is above the ${fmt(
          MAX_REASONABLE_MINOR,
        )} ceiling for a single treatment. Check whether it was entered in the wrong units.`,
      });
    }
  }

  // A custom-quote row deliberately carries no figures. Storing both says two
  // contradictory things, and display.ts would silently discard the numbers.
  if (input.isCustomQuote) {
    const stored = amounts.filter(([, value]) => isPresent(value));
    if (stored.length > 0) {
      issues.push({
        field: 'isCustomQuote',
        message:
          'A treatment marked as custom quote cannot also carry prices. Clear the prices, or turn custom quote off.',
      });
    }
    return issues;
  }

  if (isPresent(input.minMinor) && isPresent(input.maxMinor) && input.maxMinor < input.minMinor) {
    issues.push({
      field: 'maxMinor',
      message: `The maximum price cannot be below the minimum of ${fmt(input.minMinor)}.`,
    });
  }

  const regular = isPresent(input.actualMinor)
    ? input.actualMinor
    : isPresent(input.packageMinor)
      ? input.packageMinor
      : null;

  if (isPresent(input.discountedMinor)) {
    if (regular === null) {
      issues.push({
        field: 'discountedMinor',
        message:
          'A discounted price needs a regular price to be discounted from. Set the regular price, or enter this figure as the regular price instead.',
      });
    } else if (input.discountedMinor >= regular) {
      issues.push({
        field: 'discountedMinor',
        message: `The discounted price must be below the regular price of ${fmt(regular)}.`,
      });
    }
  }

  // A firm price sitting outside its own declared range is not a rounding
  // question — one of the two figures is wrong, and a patient shown the range
  // would be quoted something else at the chair.
  if (regular !== null) {
    if (isPresent(input.minMinor) && regular < input.minMinor) {
      issues.push({
        field: 'actualMinor',
        message: `The price is below the minimum of ${fmt(input.minMinor)} set on the same row.`,
      });
    }
    if (isPresent(input.maxMinor) && regular > input.maxMinor) {
      issues.push({
        field: 'actualMinor',
        message: `The price is above the maximum of ${fmt(input.maxMinor)} set on the same row.`,
      });
    }
  }

  if (!input.isCustomQuote && !input.unitKey) {
    issues.push({
      field: 'unitKey',
      message:
        'Choose a pricing unit. "₹12,000" means something different per tooth and per case, and a patient cannot tell which without it.',
    });
  }

  return issues;
}

/**
 * A Zod schema for a monetary amount arriving over HTTP.
 *
 * Amounts cross the wire as strings, not numbers. JSON numbers are IEEE
 * doubles, and a price is the last thing that should pass through a type that
 * cannot represent every integer exactly (Constitution §4).
 */
export const minorAmountSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,15}$/, 'Enter a whole number of minor units, as a string.')
  .transform((value) => BigInt(value));

export const optionalMinorAmountSchema = z
  .union([minorAmountSchema, z.null()])
  .optional();

/** Currency codes are stored and compared upper-case throughout. */
export const currencySchema = z
  .string()
  .trim()
  .length(3)
  .toUpperCase()
  .refine((code) => CURRENCY_BY_CODE.has(code), 'Unsupported currency.');
