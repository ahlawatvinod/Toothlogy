/**
 * TOOTHLOGY MONEY
 *
 * Constitution §4: money is `{ amountMinor: bigint, currency }` — never a float,
 * never a bare number.
 *
 * The reason is not pedantry. `0.1 + 0.2 === 0.30000000000000004` in IEEE-754,
 * and a marketplace that adds a few thousand line items in floats will not
 * reconcile against its payment provider. Storing an integer count of the
 * currency's smallest unit — paise, cents — makes every addition exact.
 *
 * `bigint` rather than `number` because JavaScript integers are safe only to
 * 2^53. That is about ₹90 trillion in paise, which sounds like enough right up
 * until someone aggregates lifetime platform volume, and the failure mode is
 * silent rounding rather than an error.
 *
 * Minor-unit exponents come from the currency registry, not a constant: JPY has
 * 0 decimal places, and code that assumes "always 1/100" is already wrong for
 * one of the largest economies on earth (Constitution P5).
 */

import { CURRENCY_BY_CODE } from '@/registry/globalization';
import { AppError, ERROR_CODES } from '../kernel/errors';

export interface Money {
  /** Integer count of the currency's minor units. ₹123.45 → 12345n. */
  readonly amountMinor: bigint;
  /** ISO 4217 code. */
  readonly currency: string;
}

function minorUnitsFor(currency: string): number {
  const definition = CURRENCY_BY_CODE.get(currency);
  if (!definition) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `Unknown currency '${currency}'.`, {
      details: { currency },
    });
  }
  return definition.minorUnits;
}

/** Construct from minor units — the canonical, lossless path. */
export function money(amountMinor: bigint | number, currency: string): Money {
  minorUnitsFor(currency); // validates the currency

  if (typeof amountMinor === 'number') {
    if (!Number.isInteger(amountMinor)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_FAILED,
        'Minor-unit amounts must be integers. A fractional minor unit means a rounding decision was made somewhere it should not have been.',
        { details: { amountMinor } },
      );
    }
    return { amountMinor: BigInt(amountMinor), currency };
  }

  return { amountMinor, currency };
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

/**
 * Construct from a decimal string, e.g. `'123.45'`.
 *
 * A *string*, never a float: `fromDecimal(0.1 + 0.2, 'INR')` would already have
 * lost the value before this function saw it. Parsing text keeps the boundary
 * honest, and text is what arrives from an API or a form anyway.
 */
export function fromDecimal(decimal: string, currency: string): Money {
  const exponent = minorUnitsFor(currency);
  const trimmed = decimal.trim();

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, `'${decimal}' is not a valid amount.`, {
      details: { value: decimal },
    });
  }

  const [, sign, whole, fraction = ''] = match;

  if (fraction.length > exponent) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `${currency} supports ${exponent} decimal place(s); '${decimal}' has ${fraction.length}.`,
      { details: { value: decimal, currency, maxDecimals: exponent } },
    );
  }

  const padded = fraction.padEnd(exponent, '0');
  const amount = BigInt(`${whole}${padded}`);
  return { amountMinor: sign === '-' ? -amount : amount, currency };
}

/** Render as a plain decimal string — for APIs, exports and invoices. */
export function toDecimal(value: Money): string {
  const exponent = minorUnitsFor(value.currency);
  const negative = value.amountMinor < 0n;
  const digits = (negative ? -value.amountMinor : value.amountMinor).toString();

  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;

  const padded = digits.padStart(exponent + 1, '0');
  const whole = padded.slice(0, -exponent);
  const fraction = padded.slice(-exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    // Never silently convert. An implicit conversion would need a rate, and a
    // rate needs a timestamp and a source — decisions that belong to the caller,
    // not to an arithmetic helper.
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      `Cannot combine ${a.currency} with ${b.currency}. Convert explicitly first.`,
      { details: { left: a.currency, right: b.currency } },
    );
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function sum(values: readonly Money[], currency: string): Money {
  return values.reduce((acc, v) => add(acc, v), zero(currency));
}

/** Multiply by an integer quantity — line item × count. */
export function multiply(value: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_FAILED,
      'Use percentageOf() for fractional multipliers; multiply() takes an integer quantity.',
      { details: { quantity } },
    );
  }
  return { amountMinor: value.amountMinor * BigInt(quantity), currency: value.currency };
}

export type RoundingMode = 'half_up' | 'half_even' | 'floor' | 'ceil';

/**
 * Take a percentage — tax, commission, discount.
 *
 * `basisPoints` (1/100th of a percent) rather than a float percentage, so
 * 18% GST is exactly `1800` and no rate is ever approximate.
 *
 * `half_even` (banker's rounding) is the default because repeated `half_up`
 * rounding biases totals upward, and on a marketplace that bias accumulates
 * into a real, one-directional discrepancy.
 */
export function percentageOf(
  value: Money,
  basisPoints: number,
  rounding: RoundingMode = 'half_even',
): Money {
  if (!Number.isInteger(basisPoints)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Basis points must be an integer.', {
      details: { basisPoints },
    });
  }

  const numerator = value.amountMinor * BigInt(basisPoints);
  return { amountMinor: divideRounded(numerator, 10_000n, rounding), currency: value.currency };
}

function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  const negative = numerator < 0n !== denominator < 0n;
  const absRemainderDoubled = (remainder < 0n ? -remainder : remainder) * 2n;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  switch (mode) {
    case 'floor':
      return negative ? quotient - 1n : quotient;
    case 'ceil':
      return negative ? quotient : quotient + 1n;
    case 'half_up':
      if (absRemainderDoubled >= absDenominator) return negative ? quotient - 1n : quotient + 1n;
      return quotient;
    case 'half_even': {
      if (absRemainderDoubled > absDenominator) return negative ? quotient - 1n : quotient + 1n;
      if (absRemainderDoubled < absDenominator) return quotient;
      // Exactly half: round to the even neighbour.
      if (quotient % 2n === 0n) return quotient;
      return negative ? quotient - 1n : quotient + 1n;
    }
  }
}

/**
 * Split an amount into `parts` shares that sum exactly to the original.
 *
 * The classic failure: ₹10.00 split three ways is ₹3.33 each, and ₹0.01
 * disappears. Over a million payouts that is ₹10,000 unaccounted for. This
 * distributes the remainder one minor unit at a time to the earliest shares, so
 * the parts always add back up to the whole.
 */
export function allocate(value: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Parts must be a positive integer.', {
      details: { parts },
    });
  }

  const divisor = BigInt(parts);
  const base = value.amountMinor / divisor;
  let remainder = value.amountMinor - base * divisor;
  const step = remainder < 0n ? -1n : 1n;
  if (remainder < 0n) remainder = -remainder;

  return Array.from({ length: parts }, (_, index) => ({
    amountMinor: base + (BigInt(index) < remainder ? step : 0n),
    currency: value.currency,
  }));
}

/**
 * Split by weights — a three-way revenue share, or tax apportioned across
 * unequally priced line items. Same exactness guarantee as `allocate`.
 */
export function allocateByRatio(value: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'At least one weight is required.');
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Weights must be non-negative integers.');
  }

  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) {
    throw new AppError(ERROR_CODES.VALIDATION_FAILED, 'Weights must not sum to zero.');
  }

  const totalBig = BigInt(total);
  const shares = weights.map((w) => (value.amountMinor * BigInt(w)) / totalBig);
  const allocated = shares.reduce((a, b) => a + b, 0n);
  let remainder = value.amountMinor - allocated;
  const step = remainder < 0n ? -1n : 1n;
  if (remainder < 0n) remainder = -remainder;

  return shares.map((share, index) => ({
    amountMinor: share + (BigInt(index) < remainder ? step : 0n),
    currency: value.currency,
  }));
}

// --- Comparison -------------------------------------------------------------

export function isZero(value: Money): boolean {
  return value.amountMinor === 0n;
}

export function isNegative(value: Money): boolean {
  return value.amountMinor < 0n;
}

export function isPositive(value: Money): boolean {
  return value.amountMinor > 0n;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/** -1, 0 or 1. Throws on a currency mismatch rather than guessing an order. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

// --- Presentation -----------------------------------------------------------

/**
 * Format for display in a locale.
 *
 * Uses `Intl.NumberFormat`, so ₹1,23,456.78 renders with Indian digit grouping
 * in `en-IN` and ₹123,456.78 in `en-US` — the same amount, grouped the way each
 * reader expects. Hand-rolled formatting gets this wrong for exactly the market
 * Toothlogy launches in.
 */
export function formatMoney(
  value: Money,
  locale: string = 'en-IN',
  options: Intl.NumberFormatOptions = {},
): string {
  const exponent = minorUnitsFor(value.currency);
  const asNumber = Number(toDecimal(value));

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    ...options,
  }).format(asNumber);
}

/** Serialise for JSON. `bigint` is not JSON-representable, so it becomes a string. */
export function serializeMoney(value: Money): { amountMinor: string; currency: string } {
  return { amountMinor: value.amountMinor.toString(), currency: value.currency };
}

export function deserializeMoney(value: { amountMinor: string; currency: string }): Money {
  return money(BigInt(value.amountMinor), value.currency);
}
