/**
 * TOOTHLOGY TAX
 *
 * Tax rates are configuration, per country and category, with effective dates
 * (see the TaxConfiguration model). This module answers "what rate applied to
 * this category in this country at this moment?" and computes tax on an
 * amount without floating point.
 *
 * UNCONFIGURED IS NOT ZERO
 * `taxRateFor` returns null when no rate is configured. Dental services in
 * India are seeded at 0 bps because they are exempt — a real answer. A missing
 * row means nobody has configured that market, and billing must refuse rather
 * than silently invoice at 0%.
 */

import { db } from '../db/client';
import { errors } from '../kernel/errors';
import type { Money } from '../money';

export type TaxCategory = 'dental_services' | 'dental_products' | 'dental_equipment' | 'platform_fees';

export interface TaxRate {
  readonly rateBasisPoints: number;
  readonly regime: string;
  readonly effectiveFrom: Date;
}

export async function taxRateFor(
  countryCode: string,
  category: TaxCategory,
  at: Date = new Date(),
): Promise<TaxRate | null> {
  const row = await db().taxConfiguration.findFirst({
    where: {
      countryCode: countryCode.toUpperCase(),
      category,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  return row ? { rateBasisPoints: row.rateBasisPoints, regime: row.regime, effectiveFrom: row.effectiveFrom } : null;
}

/** Like `taxRateFor`, but refuses to proceed in a market with no configuration. */
export async function requireTaxRate(countryCode: string, category: TaxCategory, at?: Date): Promise<TaxRate> {
  const rate = await taxRateFor(countryCode, category, at);
  if (!rate) {
    throw errors.preconditionFailed(
      `Tax is not configured for ${category.replace(/_/g, ' ')} in ${countryCode}. Billing is unavailable there until it is.`,
    );
  }
  return rate;
}

/**
 * Tax on a tax-exclusive amount, rounded half-up to the minor unit.
 * `rateBasisPoints` 1800 = 18%.
 */
export function taxOn(amount: Money, rateBasisPoints: number): Money {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0) {
    throw errors.validation('Tax rate must be a non-negative integer number of basis points.');
  }
  const numerator = amount.amountMinor * BigInt(rateBasisPoints);
  const tax = (numerator + BigInt(5000)) / BigInt(10000);
  return { amountMinor: tax, currency: amount.currency };
}

/** Split a tax-exclusive amount into net, tax and gross. */
export function withTax(net: Money, rateBasisPoints: number): { net: Money; tax: Money; gross: Money } {
  const tax = taxOn(net, rateBasisPoints);
  return { net, tax, gross: { amountMinor: net.amountMinor + tax.amountMinor, currency: net.currency } };
}
