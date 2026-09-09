/**
 * TOOTHLOGY BULK PRICE OPERATIONS
 *
 * Applying one change across many prices, and — the part that matters —
 * describing exactly what it will do before it does it.
 *
 * PREVIEW IS NOT A COURTESY
 * "Increase everything by 10%" applied to the wrong filter republishes a whole
 * clinic's prices, and a patient may have quoted the old ones an hour earlier.
 * So the plan is computed first, returned to the caller, and only then applied
 * (specification §16). `planPercentageChange` is pure and does not touch the
 * database, which is what makes previewing cheap and testing it easy.
 *
 * ROUNDING IS EXPLICIT
 * A 10% increase on ₹12,345 is ₹13,579.50. Half a paisa cannot be stored and
 * must not be silently truncated in whichever direction the language happens to
 * choose, so the rounding mode is a parameter and defaults to the one that does
 * not quietly shave money off every row.
 */

import { multiply, percentageOf, type RoundingMode } from '../money';
import { money } from '../money';

/** A price row as far as a bulk operation is concerned. */
export interface BulkTargetRow {
  readonly id: string;
  readonly label: string;
  readonly currency: string;
  readonly actualMinor: bigint | null;
  readonly discountedMinor: bigint | null;
  readonly isCustomQuote: boolean;
}

export interface BulkChange {
  readonly id: string;
  readonly label: string;
  readonly field: 'actualMinor' | 'discountedMinor';
  readonly previousMinor: bigint;
  readonly newMinor: bigint;
  readonly currency: string;
}

export interface BulkSkip {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

export interface BulkPlan {
  readonly changes: readonly BulkChange[];
  readonly skipped: readonly BulkSkip[];
  /** For the confirmation line: "24 services will increase by 10%." */
  readonly summary: string;
}

export interface PercentageChangeInput {
  /**
   * Basis points — hundredths of a percent. +10% is `1000`, -7.5% is `-750`.
   *
   * Basis points rather than a float percentage, matching `percentageOf` in the
   * money module and for the same reason: 7.5% as a float is not exactly 7.5%,
   * and a rate that is approximate produces prices that are approximate.
   * `basisPointsFromPercent` converts at the edge, once.
   */
  readonly basisPoints: number;
  readonly rounding?: RoundingMode;
  /** Apply to discounted prices as well as regular ones. */
  readonly includeDiscounted?: boolean;
}

/**
 * Convert a percentage a human typed into exact basis points.
 *
 * Rejects anything finer than a hundredth of a percent rather than rounding it
 * silently: if someone means 7.125% they need to know the system cannot express
 * it, not discover later that it stored 7.13%.
 */
export function basisPointsFromPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new Error('The percentage must be a finite number.');
  }
  const points = Math.round(percent * 100);
  if (Math.abs(points - percent * 100) > 1e-9) {
    throw new Error(
      `${percent}% is finer than a hundredth of a percent, which cannot be applied exactly.`,
    );
  }
  return points;
}

/** Render basis points back as a percentage for a confirmation line. */
export function percentFromBasisPoints(basisPoints: number): string {
  const percent = basisPoints / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0$/, '');
}

/**
 * Work out what a percentage change would do, without doing it.
 *
 * Rows are skipped rather than silently left alone, and each skip carries its
 * reason — a dentist who selected 30 rows and sees 24 changes needs to know
 * what happened to the other six.
 */
export function planPercentageChange(
  rows: readonly BulkTargetRow[],
  input: PercentageChangeInput,
): BulkPlan {
  const { basisPoints, rounding = 'half_up', includeDiscounted = true } = input;
  const changes: BulkChange[] = [];
  const skipped: BulkSkip[] = [];

  if (!Number.isInteger(basisPoints)) {
    throw new Error('Basis points must be a whole number. Use basisPointsFromPercent.');
  }
  // -100% would set every price to zero, which a patient reads as "free"
  // rather than as the mistake it is.
  if (basisPoints <= -10_000) {
    throw new Error('A reduction of 100% or more would set prices to zero or below.');
  }

  const applyTo = (amount: bigint, currency: string): bigint => {
    const base = money(amount, currency);
    const delta = percentageOf(base, Math.abs(basisPoints), rounding);
    const result =
      basisPoints >= 0
        ? base.amountMinor + delta.amountMinor
        : base.amountMinor - delta.amountMinor;
    return result < 0n ? 0n : result;
  };

  for (const row of rows) {
    if (row.isCustomQuote) {
      skipped.push({
        id: row.id,
        label: row.label,
        reason: 'Priced by custom quote, so there is no figure to change.',
      });
      continue;
    }

    let touched = false;

    if (row.actualMinor !== null) {
      const next = applyTo(row.actualMinor, row.currency);
      if (next !== row.actualMinor) {
        changes.push({
          id: row.id,
          label: row.label,
          field: 'actualMinor',
          previousMinor: row.actualMinor,
          newMinor: next,
          currency: row.currency,
        });
        touched = true;
      }
    }

    if (includeDiscounted && row.discountedMinor !== null) {
      const next = applyTo(row.discountedMinor, row.currency);
      if (next !== row.discountedMinor) {
        changes.push({
          id: row.id,
          label: row.label,
          field: 'discountedMinor',
          previousMinor: row.discountedMinor,
          newMinor: next,
          currency: row.currency,
        });
        touched = true;
      }
    }

    if (!touched) {
      skipped.push({
        id: row.id,
        label: row.label,
        reason:
          row.actualMinor === null && row.discountedMinor === null
            ? 'No price is set on this row yet.'
            : 'The change rounds to no difference at this price.',
      });
    }
  }

  const affected = new Set(changes.map((change) => change.id)).size;
  const direction = basisPoints >= 0 ? 'increase' : 'decrease';
  const summary =
    affected === 0
      ? 'No prices would change.'
      : `${affected} ${affected === 1 ? 'price' : 'prices'} will ${direction} by ${percentFromBasisPoints(
          Math.abs(basisPoints),
        )}%.`;

  return { changes, skipped, summary };
}

/**
 * Plan copying one clinic's prices onto another.
 *
 * Existing rows at the destination are reported as overwrites rather than
 * merged, because a half-copied price list is harder to reason about than
 * either a clean copy or none at all.
 */
export function planCopy(
  source: readonly BulkTargetRow[],
  destination: readonly BulkTargetRow[],
): { readonly created: readonly string[]; readonly overwritten: readonly string[]; readonly summary: string } {
  const existing = new Set(destination.map((row) => row.label));
  const created: string[] = [];
  const overwritten: string[] = [];

  for (const row of source) {
    if (existing.has(row.label)) overwritten.push(row.label);
    else created.push(row.label);
  }

  const parts: string[] = [];
  if (created.length) parts.push(`${created.length} added`);
  if (overwritten.length) parts.push(`${overwritten.length} overwritten`);

  return {
    created,
    overwritten,
    summary: parts.length ? `${parts.join(', ')}.` : 'Nothing to copy.',
  };
}

/** Multiply a price by a quantity, for package component totals. */
export function lineTotal(amountMinor: bigint, currency: string, quantity: number): bigint {
  return multiply(money(amountMinor, currency), quantity).amountMinor;
}
