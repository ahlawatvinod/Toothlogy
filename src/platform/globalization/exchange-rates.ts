/**
 * TOOTHLOGY EXCHANGE RATES — recorded, sourced, used only for labelled
 * approximations
 *
 * Staff record a rate (one unit of the base currency in the quote currency)
 * with its source and date. Toothlogy uses rates for one thing: an
 * approximate total across currencies in platform reports, labelled as
 * approximate with the rates and dates used. No price, charge, wallet,
 * order or invoice is ever converted — each stays in its own currency
 * (Constitution §4). No rate is ever invented: with one missing, the
 * approximation is not shown.
 *
 * Rates are exact integers (rate × 1,000,000); no rate is a float.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type AuthenticatedPrincipal, type Principal } from '../rbac';
import { CURRENCY_BY_CODE } from '@/registry/globalization';

export const FX_MANAGE = 'tl.admin.fx_rate.manage';
const MICROS = BigInt(1_000_000);
const ZERO = BigInt(0);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** "83.2451" → 83 245 100 micros, exactly; up to six decimal places. Null if not a positive rate. */
export function parseRate(text: string): bigint | null {
  const match = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(text.trim());
  if (!match) return null;
  const micros = BigInt(match[1]!) * MICROS + BigInt((match[2] ?? '').padEnd(6, '0'));
  return micros > ZERO ? micros : null;
}

/** 83 245 100 micros → "83.2451". */
export function rateText(micros: bigint): string {
  const whole = micros / MICROS;
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * An amount in one currency's minor units, re-expressed in another's at a
 * rate, rounded half away from zero. Minor units differ by currency (JPY has
 * none), so both are taken into account.
 */
export function convertMinor(amountMinor: bigint, rateMicros: bigint, fromMinorUnits: number, toMinorUnits: number): bigint {
  const numerator = amountMinor * rateMicros * TEN ** BigInt(toMinorUnits);
  const denominator = MICROS * TEN ** BigInt(fromMinorUnits);
  const half = denominator / TWO;
  return numerator >= ZERO ? (numerator + half) / denominator : -((-numerator + half) / denominator);
}

function staff(principal: Principal): AuthenticatedPrincipal {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  if (!can(principal, FX_MANAGE)) throw errors.forbidden(FX_MANAGE);
  return principal;
}

export const rateSchema = z.object({
  baseCurrency: z.string().trim().toUpperCase().length(3, 'Choose a currency.'),
  quoteCurrency: z.string().trim().toUpperCase().length(3, 'Choose a currency.'),
  rate: z.string().trim().min(1, 'Enter the rate.'),
  source: z.string().trim().min(3, 'Name the source, for example “RBI reference rate”.').max(120),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date of the rate.'),
});

export async function recordRate(principal: Principal, raw: z.input<typeof rateSchema>, context: { requestId?: string; now?: Date } = {}) {
  const me = staff(principal);
  const parsed = rateSchema.safeParse(raw);
  if (!parsed.success) throw errors.validation(parsed.error.issues[0]!.message, { field: String(parsed.error.issues[0]!.path[0] ?? 'rate') });
  const input = parsed.data;
  const now = context.now ?? new Date();
  if (!CURRENCY_BY_CODE.has(input.baseCurrency)) throw errors.validation('Choose a currency in the currency registry.', { field: 'baseCurrency' });
  if (!CURRENCY_BY_CODE.has(input.quoteCurrency)) throw errors.validation('Choose a currency in the currency registry.', { field: 'quoteCurrency' });
  if (input.baseCurrency === input.quoteCurrency) throw errors.validation('Choose two different currencies.', { field: 'quoteCurrency' });
  const rateMicros = parseRate(input.rate);
  if (!rateMicros) throw errors.validation('Enter the rate as a positive number with up to six decimal places.', { field: 'rate' });
  const asOf = new Date(`${input.asOf}T00:00:00Z`);
  if (Number.isNaN(asOf.getTime()) || asOf.getTime() > now.getTime() + 86_400_000) throw errors.validation('A rate cannot be dated in the future.', { field: 'asOf' });
  const id = newId('exchangeRate');
  try {
    await db().exchangeRate.create({ data: { id, baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency, rateMicros, source: input.source, asOf, recordedByUserId: me.userId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('A rate for that pair and date is already recorded.');
    throw error;
  }
  await recordAuditEvent({ action: 'FX_RATE_RECORDED', actor: me.userId, subject: id, outcome: 'success', requestId: context.requestId, detail: { baseCurrency: input.baseCurrency, quoteCurrency: input.quoteCurrency, rate: rateText(rateMicros), source: input.source, asOf: input.asOf } });
  return { rateId: id };
}

export async function listRates(principal: Principal) {
  staff(principal);
  const rows = await db().exchangeRate.findMany({ orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }], take: 200 });
  return rows.map((r) => ({ ...r, rate: rateText(r.rateMicros) }));
}

/** The latest rate from one currency to another on or before a moment — recorded directly, or the inverse of one recorded the other way. */
export async function rateFor(from: string, to: string, at: Date = new Date()): Promise<{ rateMicros: bigint; asOf: Date; source: string } | null> {
  if (from === to) return { rateMicros: MICROS, asOf: at, source: 'same currency' };
  const direct = await db().exchangeRate.findFirst({ where: { baseCurrency: from, quoteCurrency: to, asOf: { lte: at } }, orderBy: { asOf: 'desc' } });
  if (direct) return { rateMicros: direct.rateMicros, asOf: direct.asOf, source: direct.source };
  const inverse = await db().exchangeRate.findFirst({ where: { baseCurrency: to, quoteCurrency: from, asOf: { lte: at } }, orderBy: { asOf: 'desc' } });
  if (inverse) return { rateMicros: (MICROS * MICROS + inverse.rateMicros / TWO) / inverse.rateMicros, asOf: inverse.asOf, source: `${inverse.source} (inverted)` };
  return null;
}

export type Approximation =
  | { complete: true; currency: string; minor: bigint; rates: Array<{ currency: string; rate: string; asOf: Date; source: string }> }
  | { complete: false; currency: string; missing: string[] };

/** A labelled approximate total, in one currency, of amounts held in several. Incomplete (and not totalled) when any rate is missing. */
export async function approximateTotal(amounts: ReadonlyArray<{ currency: string; minor: number | bigint }>, target: string, at: Date = new Date()): Promise<Approximation> {
  let total = ZERO;
  const rates: Array<{ currency: string; rate: string; asOf: Date; source: string }> = [];
  const missing: string[] = [];
  for (const amount of amounts) {
    const rate = await rateFor(amount.currency, target, at);
    if (!rate) {
      missing.push(amount.currency);
      continue;
    }
    total += convertMinor(BigInt(amount.minor), rate.rateMicros, CURRENCY_BY_CODE.get(amount.currency)?.minorUnits ?? 2, CURRENCY_BY_CODE.get(target)?.minorUnits ?? 2);
    if (amount.currency !== target) rates.push({ currency: amount.currency, rate: rateText(rate.rateMicros), asOf: rate.asOf, source: rate.source });
  }
  return missing.length > 0 ? { complete: false, currency: target, missing } : { complete: true, currency: target, minor: total, rates };
}
