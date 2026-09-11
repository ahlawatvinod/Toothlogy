/**
 * TOOTHLOGY LEAD BILLING — wallet, ledger, statements, disputes
 *
 * PROPERTIES THAT HOLD WHATEVER THE CALLER DOES
 * - **No balance change without a ledger entry.** `balanceMinor` is written
 *   only inside `post`, in the same transaction as the entry it reflects, under
 *   a row lock on the wallet.
 * - **No double charge.** Every entry carries an idempotency key unique per
 *   wallet; a lead's charge key is `lead-charge:<leadId>`, so a second charge
 *   for the same lead cannot be written at all.
 * - **Free leads are counted exactly.** Each qualified lead takes the next
 *   `billingOrdinal` for its organization while holding the wallet lock, and a
 *   unique index on (organization, ordinal) backs that up — so "lead 30" and
 *   "lead 31" are decided once, in order, even under concurrent qualification.
 * - **No silent overdraft.** A database check keeps the balance at or above
 *   minus the credit limit (0 unless configured). A charge the wallet cannot
 *   cover is not written; the lead is marked PENDING_FUNDS instead.
 * - **Append-only.** A database trigger forbids editing or deleting ledger
 *   entries. A correction is a REFUND or REVERSAL, each linked to the entry it
 *   corrects, and each entry can be corrected once.
 * - **One key, one credit.** A credit's idempotency key is unique across every
 *   wallet: replaying it returns the original credit, and reusing it for a
 *   different organization or amount is refused.
 * - **Nothing pretends to be paid.** Card/UPI top-ups go through the payment
 *   port, which is NOT_CONFIGURED until a provider is connected. The only
 *   working credit today is a staff-recorded transfer with a reference.
 *
 * Prices, the free allowance, the recharge minimum and the low-balance level
 * come from LeadPricingRule (the most specific active rule wins); tax from
 * TaxConfiguration. No amount is written in this file.
 *
 * TAX MODEL
 * The wallet holds money in the currency's minor unit, tax included. A paid
 * lead debits its price plus tax, and the tax is recorded on that entry —
 * that is where GST arises. A recharge of N leads is therefore N × (price +
 * tax): the "GST" on a recharge quote is the tax those N leads will carry,
 * shown so the practice sees the total payable, not a second tax.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { requireTaxRate, type TaxCategory } from '../tax';
import { paymentProvider } from '../payments/ports';
import { formatMoney } from '../money';
import { can, isAuthenticated, type Principal } from '../rbac';
import { addDays, zonedToUtc } from '@/lib/zoned-time';

type Tx = Prisma.TransactionClient;

export type LedgerKind = 'TOP_UP' | 'LEAD_CHARGE' | 'REFUND' | 'REVERSAL' | 'ADJUSTMENT' | 'SPONSORED_HOLD' | 'SPONSORED_REFUND' | 'MEMBERSHIP_CHARGE';

const TEN_THOUSAND = BigInt(10000);
const ZERO = BigInt(0);
/**
 * Magnitude. Lead charges written before 2026-09-12 carry a positive net/tax
 * with a negative amount; later ones are signed like the amount. The ledger is
 * append-only, so totals read magnitudes and take the sign from the kind.
 */
const abs = (v: bigint | null | undefined): bigint => (v === null || v === undefined ? ZERO : v < ZERO ? -v : v);

// ---------------------------------------------------------------------------
// Pure arithmetic (unit-tested)
// ---------------------------------------------------------------------------

/** Tax added on top of a net amount, rounded half up to the minor unit. */
export function taxOnNet(netMinor: bigint, rateBasisPoints: number): bigint {
  return (netMinor * BigInt(rateBasisPoints) + BigInt(5000)) / TEN_THOUSAND;
}

/** The net part of a tax-inclusive amount, rounded half up. */
export function netOfGross(grossMinor: bigint, rateBasisPoints: number): bigint {
  const divisor = TEN_THOUSAND + BigInt(rateBasisPoints);
  return (grossMinor * TEN_THOUSAND + divisor / BigInt(2)) / divisor;
}

/** Whether an organization's Nth qualified lead is inside its free allowance. */
export function billingDecision(ordinal: number, freeLeadAllowance: number): 'FREE' | 'PAYABLE' {
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new RangeError('A lead ordinal starts at 1.');
  return ordinal <= freeLeadAllowance ? 'FREE' : 'PAYABLE';
}

// ---------------------------------------------------------------------------
// Wallet and posting
// ---------------------------------------------------------------------------

async function walletFor(tx: Tx, organizationId: string) {
  const existing = await tx.wallet.findUnique({ where: { organizationId } });
  if (existing) return existing;
  const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
  if (!organization) throw errors.notFound('Organization');
  // Concurrent first use: both insert, one wins on the unique key.
  await tx.$executeRaw`
    INSERT INTO "wallets" ("id", "organizationId", "currency", "balanceMinor", "creditLimitMinor", "updatedAt")
    VALUES (${newId('wallet')}, ${organizationId}, ${organization.currency}, 0, 0, now())
    ON CONFLICT ("organizationId") DO NOTHING`;
  return tx.wallet.findUniqueOrThrow({ where: { organizationId } });
}

/** Lock the wallet row for the rest of the transaction and return it fresh. */
async function lockWallet(tx: Tx, organizationId: string) {
  const wallet = await walletFor(tx, organizationId);
  await tx.$queryRaw`SELECT "id" FROM "wallets" WHERE "id" = ${wallet.id} FOR UPDATE`;
  return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
}

interface PostInput {
  readonly kind: LedgerKind;
  readonly amountMinor: bigint;
  readonly idempotencyKey: string;
  readonly netMinor?: bigint | null;
  readonly taxMinor?: bigint | null;
  readonly taxRateBasisPoints?: number | null;
  readonly leadId?: string | null;
  readonly campaignId?: string | null;
  readonly reversesEntryId?: string | null;
  readonly externalReference?: string | null;
  readonly memo?: string | null;
  readonly actorUserId?: string | null;
}

type PostResult =
  | { posted: true; entry: Prisma.LedgerEntryGetPayload<object>; replayed: boolean }
  | { posted: false; reason: 'INSUFFICIENT_FUNDS'; balanceMinor: bigint; requiredMinor: bigint };

/**
 * Write one ledger entry and move the balance with it. Must run inside a
 * transaction that has locked the wallet (`lockWallet`).
 */
async function post(tx: Tx, wallet: { id: string; currency: string; balanceMinor: bigint; creditLimitMinor: bigint }, input: PostInput): Promise<PostResult> {
  const prior = await tx.ledgerEntry.findUnique({
    where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: input.idempotencyKey } },
  });
  if (prior) return { posted: true, entry: prior, replayed: true };

  const balanceAfter = wallet.balanceMinor + input.amountMinor;
  if (input.amountMinor < ZERO && balanceAfter < -wallet.creditLimitMinor) {
    return { posted: false, reason: 'INSUFFICIENT_FUNDS', balanceMinor: wallet.balanceMinor, requiredMinor: -input.amountMinor };
  }

  const entry = await tx.ledgerEntry.create({
    data: {
      id: newId('ledgerEntry'),
      walletId: wallet.id,
      kind: input.kind,
      amountMinor: input.amountMinor,
      balanceAfterMinor: balanceAfter,
      currency: wallet.currency,
      netMinor: input.netMinor ?? null,
      taxMinor: input.taxMinor ?? null,
      taxRateBasisPoints: input.taxRateBasisPoints ?? null,
      leadId: input.leadId ?? null,
      campaignId: input.campaignId ?? null,
      reversesEntryId: input.reversesEntryId ?? null,
      idempotencyKey: input.idempotencyKey,
      externalReference: input.externalReference ?? null,
      memo: input.memo ?? null,
      actorUserId: input.actorUserId ?? null,
    },
  });
  await tx.wallet.update({ where: { id: wallet.id }, data: { balanceMinor: balanceAfter } });
  return { posted: true, entry, replayed: false };
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export interface PriceQuote {
  readonly ruleId: string;
  readonly currency: string;
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly grossMinor: bigint;
  readonly taxRateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly freeLeadAllowance: number;
  readonly minimumRechargeLeads: number;
  readonly lowBalanceLeads: number;
}

/**
 * The price of one paid qualified lead, and the tiers around it: the most
 * specific active rule for the organization's country. A rule field that is
 * set must match; the more fields match, the more specific the rule.
 */
export async function quoteLead(
  lead: { organizationId: string; dentistProfileId: string | null; treatmentId: string | null; source: 'BOOKING' | 'CALLBACK_REQUEST' },
  at: Date = new Date(),
  client: Pick<Tx, 'organization' | 'leadPricingRule'> = db(),
): Promise<PriceQuote> {
  const organization = await client.organization.findUniqueOrThrow({ where: { id: lead.organizationId }, select: { countryCode: true } });
  const rules = await client.leadPricingRule.findMany({
    where: {
      countryCode: organization.countryCode,
      isActive: true,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
  });
  const matching = rules
    .filter(
      (r) =>
        (r.dentistProfileId === null || r.dentistProfileId === lead.dentistProfileId) &&
        (r.organizationId === null || r.organizationId === lead.organizationId) &&
        (r.treatmentId === null || r.treatmentId === lead.treatmentId) &&
        (r.leadSource === null || r.leadSource === lead.source) &&
        r.campaign === null,
    )
    .map((r) => ({
      rule: r,
      score:
        (r.dentistProfileId ? 16 : 0) + (r.organizationId ? 8 : 0) + (r.treatmentId ? 4 : 0) + (r.leadSource ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || b.rule.effectiveFrom.getTime() - a.rule.effectiveFrom.getTime());

  const chosen = matching[0]?.rule;
  if (!chosen) {
    throw errors.preconditionFailed(`Lead pricing is not configured for ${organization.countryCode}. No lead there can be billed until it is.`);
  }
  const rate = await requireTaxRate(organization.countryCode, chosen.taxCategory as TaxCategory, at);
  const net = chosen.taxInclusive ? netOfGross(chosen.priceMinor, rate.rateBasisPoints) : chosen.priceMinor;
  const tax = chosen.taxInclusive ? chosen.priceMinor - net : taxOnNet(net, rate.rateBasisPoints);
  return {
    ruleId: chosen.id,
    currency: chosen.currency,
    netMinor: net,
    taxMinor: tax,
    grossMinor: net + tax,
    taxRateBasisPoints: rate.rateBasisPoints,
    taxInclusive: chosen.taxInclusive,
    freeLeadAllowance: chosen.freeLeadAllowance,
    minimumRechargeLeads: chosen.minimumRechargeLeads,
    lowBalanceLeads: chosen.lowBalanceLeads,
  };
}

/**
 * The standard price of one paid lead in a country — the rule no dentist,
 * organization, treatment, source or campaign narrows — for public pages that
 * explain pricing. Null when none is configured (then no page states a price).
 */
export async function standardLeadPricing(countryCode = 'IN', at: Date = new Date()): Promise<PriceQuote | null> {
  const rule = await db().leadPricingRule.findFirst({
    where: { countryCode, isActive: true, effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }], dentistProfileId: null, organizationId: null, treatmentId: null, leadSource: null, campaign: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!rule) return null;
  try {
    const rate = await requireTaxRate(countryCode, rule.taxCategory as TaxCategory, at);
    const net = rule.taxInclusive ? netOfGross(rule.priceMinor, rate.rateBasisPoints) : rule.priceMinor;
    const tax = rule.taxInclusive ? rule.priceMinor - net : taxOnNet(net, rate.rateBasisPoints);
    return {
      ruleId: rule.id,
      currency: rule.currency,
      netMinor: net,
      taxMinor: tax,
      grossMinor: net + tax,
      taxRateBasisPoints: rate.rateBasisPoints,
      taxInclusive: rule.taxInclusive,
      freeLeadAllowance: rule.freeLeadAllowance,
      minimumRechargeLeads: rule.minimumRechargeLeads,
      lowBalanceLeads: rule.lowBalanceLeads,
    };
  } catch {
    // No tax rate configured: a price without its tax would mislead.
    return null;
  }
}

const orgQuote = (organizationId: string, at?: Date) =>
  quoteLead({ organizationId, dentistProfileId: null, treatmentId: null, source: 'BOOKING' }, at);

// ---------------------------------------------------------------------------
// Billing a qualified lead: free or payable, then the wallet
// ---------------------------------------------------------------------------

export type ChargeResult =
  | { status: 'FREE'; ordinal: number; replayed: boolean }
  | { status: 'CHARGED'; entryId: string; grossMinor: bigint; ordinal: number | null; replayed: boolean }
  | { status: 'PENDING_FUNDS'; balanceMinor: bigint; requiredMinor: bigint; ordinal: number };

const BILLABLE_STATUSES = ['QUALIFIED', 'DELIVERED', 'ACCEPTED', 'CONTACTED', 'APPOINTMENT', 'COMPLETED', 'CONVERTED'];

/**
 * Decide and settle a qualified lead's billing, once:
 * QUALIFIED → ordinal → FREE (inside the allowance) or PAYABLE → wallet →
 * CHARGED, or PENDING_FUNDS until a credit arrives. Called after
 * qualification and again after every credit. Safe to call any number of
 * times, from any number of workers at once.
 */
export async function chargeLead(leadId: string, now: Date = new Date()): Promise<ChargeResult> {
  return transaction(async (tx) => {
    const before = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (!BILLABLE_STATUSES.includes(before.status)) throw errors.preconditionFailed('Only a qualified lead can be billed.');
    if (before.billingStatus === 'REFUNDED' || before.billingStatus === 'WAIVED') {
      throw errors.preconditionFailed('This lead was refunded or waived and cannot be billed again.');
    }

    const quote = await quoteLead(before, now, tx);
    const wallet = await lockWallet(tx, before.organizationId);
    // Re-read under the lock: another worker may have billed it while we waited.
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    if (lead.billingStatus === 'FREE') return { status: 'FREE', ordinal: lead.billingOrdinal ?? 0, replayed: true };
    if (lead.billingStatus === 'CHARGED' && lead.chargeEntryId) {
      const entry = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: lead.chargeEntryId } });
      return { status: 'CHARGED', entryId: entry.id, grossMinor: -entry.amountMinor, ordinal: lead.billingOrdinal, replayed: true };
    }
    if (wallet.currency !== quote.currency) {
      throw errors.preconditionFailed(`The wallet is in ${wallet.currency} but the lead price is in ${quote.currency}.`);
    }

    // The organization's next ordinal. The wallet lock serializes every
    // billing decision for the organization; the unique index is the backstop.
    let ordinal = lead.billingOrdinal;
    if (ordinal === null) {
      const max = await tx.lead.aggregate({ where: { organizationId: lead.organizationId }, _max: { billingOrdinal: true } });
      ordinal = (max._max.billingOrdinal ?? 0) + 1;
      await tx.lead.update({ where: { id: lead.id }, data: { billingOrdinal: ordinal, billedAt: now, pricingRuleId: quote.ruleId } });
    }

    const standardFree = billingDecision(ordinal, quote.freeLeadAllowance) === 'FREE';
    // After the standard allowance, a current Prime period's bonus leads are
    // free too — counted under the same wallet lock, so never over-granted.
    const bonus = standardFree ? null : await primeBonusLead(tx, lead.organizationId, now);
    if (standardFree || bonus) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { billingStatus: 'FREE', pricingRuleId: quote.ruleId, priceMinor: ZERO, taxMinor: ZERO, currency: quote.currency, ...(bonus ? { membershipId: bonus.membershipId } : {}) },
      });
      await tx.leadEvent.create({
        data: {
          id: newId('leadEvent'),
          leadId: lead.id,
          action: 'BILLED_FREE',
          fromStatus: lead.status,
          toStatus: lead.status,
          reason: bonus ? `Prime bonus lead ${bonus.used + 1} of ${bonus.allowance} in this membership period.` : `Qualified lead ${ordinal} of the ${quote.freeLeadAllowance} free leads.`,
          detail: bonus
            ? { ordinal, membershipId: bonus.membershipId, bonusUsed: bonus.used + 1, bonusAllowance: bonus.allowance, ruleId: quote.ruleId }
            : { ordinal, freeLeadAllowance: quote.freeLeadAllowance, ruleId: quote.ruleId },
        },
      });
      await emitInTransaction(
        tx,
        'LEAD_BILLED',
        { leadId: lead.id, organizationId: lead.organizationId, outcome: 'FREE', ordinal, freeLeadAllowance: quote.freeLeadAllowance, currency: quote.currency, ...(bonus ? { primeBonus: true } : {}) },
        { actor: 'system' },
      );
      return { status: 'FREE', ordinal, replayed: false };
    }

    const result = await post(tx, wallet, {
      kind: 'LEAD_CHARGE',
      amountMinor: -quote.grossMinor,
      idempotencyKey: `lead-charge:${lead.id}`,
      netMinor: -quote.netMinor,
      taxMinor: -quote.taxMinor,
      taxRateBasisPoints: quote.taxRateBasisPoints,
      leadId: lead.id,
      memo: `Qualified lead ${ordinal}`,
    });

    if (!result.posted) {
      const firstTime = lead.billingStatus !== 'PENDING_FUNDS';
      await tx.lead.update({
        where: { id: lead.id },
        data: { billingStatus: 'PENDING_FUNDS', pricingRuleId: quote.ruleId, priceMinor: quote.netMinor, taxMinor: quote.taxMinor, currency: quote.currency },
      });
      if (firstTime) {
        await tx.leadEvent.create({
          data: {
            id: newId('leadEvent'),
            leadId: lead.id,
            action: 'CHARGE_DEFERRED',
            fromStatus: lead.status,
            toStatus: lead.status,
            reason: 'Insufficient wallet balance',
            detail: { ordinal, balanceMinor: result.balanceMinor.toString(), requiredMinor: result.requiredMinor.toString() },
          },
        });
        await emitInTransaction(
          tx,
          'LEAD_BILLED',
          { leadId: lead.id, organizationId: lead.organizationId, outcome: 'PENDING_FUNDS', ordinal, grossMinor: quote.grossMinor.toString(), currency: quote.currency },
          { actor: 'system' },
        );
      }
      return { status: 'PENDING_FUNDS', balanceMinor: result.balanceMinor, requiredMinor: result.requiredMinor, ordinal };
    }

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        billingStatus: 'CHARGED',
        chargeEntryId: result.entry.id,
        pricingRuleId: quote.ruleId,
        priceMinor: quote.netMinor,
        taxMinor: quote.taxMinor,
        currency: quote.currency,
      },
    });
    if (!result.replayed) {
      await tx.leadEvent.create({
        data: {
          id: newId('leadEvent'),
          leadId: lead.id,
          action: 'CHARGED',
          fromStatus: lead.status,
          toStatus: lead.status,
          detail: { entryId: result.entry.id, ordinal, grossMinor: quote.grossMinor.toString(), netMinor: quote.netMinor.toString(), taxMinor: quote.taxMinor.toString(), ruleId: quote.ruleId },
        },
      });
      await emitInTransaction(
        tx,
        'LEAD_BILLED',
        {
          leadId: lead.id,
          organizationId: lead.organizationId,
          outcome: 'CHARGED',
          ordinal,
          netMinor: quote.netMinor.toString(),
          taxMinor: quote.taxMinor.toString(),
          grossMinor: quote.grossMinor.toString(),
          balanceAfterMinor: result.entry.balanceAfterMinor.toString(),
          currency: quote.currency,
        },
        { actor: 'system' },
      );
      // Crossing the low-balance line (not every charge below it) is news.
      const threshold = quote.grossMinor * BigInt(quote.lowBalanceLeads);
      if (quote.lowBalanceLeads > 0 && wallet.balanceMinor >= threshold && result.entry.balanceAfterMinor < threshold) {
        await emitInTransaction(
          tx,
          'WALLET_LOW_BALANCE',
          { organizationId: lead.organizationId, balanceMinor: result.entry.balanceAfterMinor.toString(), thresholdMinor: threshold.toString(), leadsCovered: Number(result.entry.balanceAfterMinor / quote.grossMinor), currency: quote.currency },
          { actor: 'system' },
        );
      }
    }
    return { status: 'CHARGED', entryId: result.entry.id, grossMinor: quote.grossMinor, ordinal, replayed: result.replayed };
  });
}

/**
 * The organization's current Prime period, if it has bonus free leads left.
 * Runs under the wallet lock the caller holds.
 */
async function primeBonusLead(tx: Tx, organizationId: string, now: Date) {
  const membership = await tx.membership.findFirst({
    where: { organizationId, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
    select: { id: true, plan: { select: { bonusFreeLeads: true } } },
  });
  if (!membership || membership.plan.bonusFreeLeads <= 0) return null;
  const used = await tx.lead.count({ where: { membershipId: membership.id, billingStatus: 'FREE' } });
  return used < membership.plan.bonusFreeLeads ? { membershipId: membership.id, used, allowance: membership.plan.bonusFreeLeads } : null;
}

/**
 * Charge a Prime membership period (net plus tax) to the organization's lead
 * wallet: one ledger entry, keyed so a retried purchase or renewal is charged
 * once. Runs in the caller's transaction, which writes the membership too.
 */
export async function chargeMembership(
  tx: Tx,
  organizationId: string,
  input: { idempotencyKey: string; netMinor: bigint; taxMinor: bigint; taxRateBasisPoints: number; currency: string; memo: string; actorUserId: string | null },
): Promise<{ ok: true; entryId: string } | { ok: false; balanceMinor: bigint; requiredMinor: bigint }> {
  const wallet = await lockWallet(tx, organizationId);
  if (wallet.currency !== input.currency) throw errors.preconditionFailed(`The wallet is in ${wallet.currency} but the plan is priced in ${input.currency}.`);
  const result = await post(tx, wallet, {
    kind: 'MEMBERSHIP_CHARGE',
    amountMinor: -(input.netMinor + input.taxMinor),
    idempotencyKey: input.idempotencyKey,
    netMinor: -input.netMinor,
    taxMinor: -input.taxMinor,
    taxRateBasisPoints: input.taxRateBasisPoints,
    memo: input.memo,
    actorUserId: input.actorUserId,
  });
  return result.posted ? { ok: true, entryId: result.entry.id } : { ok: false, balanceMinor: result.balanceMinor, requiredMinor: result.requiredMinor };
}

// ---------------------------------------------------------------------------
// Recharges and credits
// ---------------------------------------------------------------------------

export interface RechargeQuote {
  readonly currency: string;
  readonly leads: number;
  readonly minimumLeads: number;
  readonly perLead: { netMinor: bigint; taxMinor: bigint; grossMinor: bigint };
  readonly netMinor: bigint;
  readonly taxMinor: bigint;
  readonly totalMinor: bigint;
  readonly minimumTotalMinor: bigint;
  readonly taxRateBasisPoints: number;
}

/** What N paid leads cost to prepay: N × price, the tax they carry, the total. */
export async function rechargeQuote(organizationId: string, leads?: number, at: Date = new Date()): Promise<RechargeQuote> {
  const quote = await orgQuote(organizationId, at);
  const minimumLeads = quote.minimumRechargeLeads;
  const count = leads ?? Math.max(minimumLeads, 1);
  if (!Number.isInteger(count) || count < 1 || count > 10_000) throw errors.validation('Choose between 1 and 10,000 leads.', { field: 'leads' });
  const n = BigInt(count);
  return {
    currency: quote.currency,
    leads: count,
    minimumLeads,
    perLead: { netMinor: quote.netMinor, taxMinor: quote.taxMinor, grossMinor: quote.grossMinor },
    netMinor: quote.netMinor * n,
    taxMinor: quote.taxMinor * n,
    totalMinor: quote.grossMinor * n,
    minimumTotalMinor: quote.grossMinor * BigInt(minimumLeads),
    taxRateBasisPoints: quote.taxRateBasisPoints,
  };
}

export const creditSchema = z
  .object({
    organizationId: z.string().min(1).max(64),
    amountMinor: z.coerce.bigint().refine((v) => v > ZERO && v <= BigInt(100_000_000), 'Enter an amount between 0 and 10,00,000.'),
    kind: z.enum(['TOP_UP', 'ADJUSTMENT']).default('TOP_UP'),
    externalReference: z.string().trim().min(3, 'Record the bank or transfer reference.').max(120),
    memo: z.string().trim().max(300).optional(),
    /** Staff may record a recharge below the minimum only by saying so, with a reason. */
    allowBelowMinimum: z.boolean().default(false),
  })
  .refine((v) => !v.allowBelowMinimum || (v.memo ?? '').length >= 10, {
    message: 'Explain why this recharge is below the minimum (at least 10 characters).',
    path: ['memo'],
  });

function isCreditKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Record money received outside the platform (a bank transfer), by staff
 * holding `tl.billing.ledger.adjust`. The reference is required: an unreferenced
 * credit cannot be reconciled. A recharge (TOP_UP) must reach the configured
 * minimum unless the staff member explicitly allows it and says why. Then
 * every lead waiting for funds is retried.
 */
export async function creditWallet(principal: Principal, raw: z.input<typeof creditSchema>, context: { idempotencyKey: string; requestId?: string }) {
  if (!can(principal, 'tl.billing.ledger.adjust')) throw errors.forbidden('tl.billing.ledger.adjust');
  const key = context.idempotencyKey?.trim() ?? '';
  if (key.length < 8 || key.length > 200) throw errors.validation('An Idempotency-Key header (8–200 characters) is required for a credit.');
  const input = creditSchema.parse(raw);
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;
  const ledgerKey = `credit:${key}`;

  const quote = await orgQuote(input.organizationId);
  const minimum = quote.grossMinor * BigInt(quote.minimumRechargeLeads);
  const belowMinimum = input.kind === 'TOP_UP' && input.amountMinor < minimum;
  if (belowMinimum && !input.allowBelowMinimum) {
    throw errors.validation(
      `The minimum recharge is ${quote.minimumRechargeLeads} paid leads: ${formatMoney({ amountMinor: minimum, currency: quote.currency }, 'en-IN')} including GST.`,
      { field: 'amountMinor', minimumMinor: minimum.toString() },
    );
  }

  const sameCredit = (e: { walletId: string; amountMinor: bigint; kind: string }, walletId: string) =>
    e.walletId === walletId && e.amountMinor === input.amountMinor && e.kind === input.kind;

  let outcome: { entry: Prisma.LedgerEntryGetPayload<object>; replayed: boolean };
  try {
    outcome = await transaction(async (tx) => {
      const wallet = await lockWallet(tx, input.organizationId);
      const used = await tx.ledgerEntry.findFirst({ where: { idempotencyKey: ledgerKey, kind: { in: ['TOP_UP', 'ADJUSTMENT'] } } });
      if (used) {
        if (!sameCredit(used, wallet.id)) throw errors.conflict('This Idempotency-Key was already used for a different credit.');
        return { entry: used, replayed: true };
      }
      // The recharge's share of tax, recorded for the statement.
      const net = input.kind === 'TOP_UP' ? netOfGross(input.amountMinor, quote.taxRateBasisPoints) : null;
      const result = await post(tx, wallet, {
        kind: input.kind,
        amountMinor: input.amountMinor,
        idempotencyKey: ledgerKey,
        netMinor: net,
        taxMinor: net === null ? null : input.amountMinor - net,
        taxRateBasisPoints: net === null ? null : quote.taxRateBasisPoints,
        externalReference: input.externalReference,
        memo: input.memo ?? null,
        actorUserId,
      });
      if (!result.posted) throw errors.internal('A credit cannot be refused for funds.');
      if (!result.replayed) {
        await emitInTransaction(
          tx,
          'WALLET_CREDITED',
          { organizationId: input.organizationId, entryId: result.entry.id, kind: input.kind, amountMinor: input.amountMinor.toString(), balanceAfterMinor: result.entry.balanceAfterMinor.toString(), currency: wallet.currency },
          { requestId: context.requestId, actor: actorUserId ?? 'system' },
        );
      }
      return { entry: result.entry, replayed: result.replayed };
    });
  } catch (error) {
    // The same key racing itself against another wallet: the global index
    // lets exactly one through.
    if (!isCreditKeyViolation(error)) throw error;
    const used = await db().ledgerEntry.findFirst({ where: { idempotencyKey: ledgerKey, kind: { in: ['TOP_UP', 'ADJUSTMENT'] } }, include: { wallet: true } });
    if (!used || used.wallet.organizationId !== input.organizationId || used.amountMinor !== input.amountMinor || used.kind !== input.kind) {
      throw errors.conflict('This Idempotency-Key was already used for a different credit.');
    }
    outcome = { entry: used, replayed: true };
  }

  if (!outcome.replayed) {
    await recordAuditEvent({
      action: 'WALLET_CREDITED',
      actor: actorUserId ?? 'system',
      subject: outcome.entry.walletId,
      outcome: 'success',
      organizationId: input.organizationId,
      requestId: context.requestId,
      detail: { entryId: outcome.entry.id, kind: input.kind, amountMinor: input.amountMinor.toString(), reference: input.externalReference, belowMinimum },
    });
  }

  const { retryPendingFunds } = await import('../leads/service');
  const retried = await retryPendingFunds(input.organizationId);
  return { entry: outcome.entry, retried, replayed: outcome.replayed };
}

/**
 * Start a card/UPI top-up. The amount must meet the recharge minimum. Goes
 * through the payment port; with no provider connected this throws
 * NOT_CONFIGURED, and nothing is credited.
 */
export async function startTopUp(principal: Principal, organizationId: string, amountMinor: bigint, idempotencyKey: string) {
  if (!can(principal, 'tl.billing.wallet.read', { organizationId })) throw errors.notFound('Organization');
  const quote = await rechargeQuote(organizationId);
  if (amountMinor < quote.minimumTotalMinor) {
    throw errors.validation(
      `The minimum recharge is ${quote.minimumLeads} paid leads: ${formatMoney({ amountMinor: quote.minimumTotalMinor, currency: quote.currency }, 'en-IN')} including GST.`,
      { field: 'amountMinor', minimumMinor: quote.minimumTotalMinor.toString() },
    );
  }
  const intent = await paymentProvider.get().createIntent({
    amount: { amountMinor, currency: quote.currency },
    reference: `wallet-topup:${organizationId}`,
    description: 'Toothlogy lead wallet recharge',
    idempotencyKey,
  });
  // Credit happens only when the provider's verified webhook confirms capture.
  return { providerIntentId: intent.providerIntentId, status: intent.status, actionUrl: intent.actionUrl ?? null };
}

// ---------------------------------------------------------------------------
// Sponsored campaigns: hold the budget, refund what was not spent
// ---------------------------------------------------------------------------

/**
 * Hold (part of) a campaign's budget. Runs in the caller's transaction and
 * locks the wallet; refused — not written — when the wallet cannot cover it.
 * Keyed `campaign-hold:<campaign>:<n>`, so a retried activation or budget
 * increase is written once.
 */
export async function holdCampaignBudget(
  tx: Tx,
  organizationId: string,
  input: { campaignId: string; amountMinor: bigint; sequence: number; taxRateBasisPoints: number; actorUserId: string | null },
): Promise<{ posted: true; entryId: string } | { posted: false; balanceMinor: bigint }> {
  const wallet = await lockWallet(tx, organizationId);
  const net = netOfGross(input.amountMinor, input.taxRateBasisPoints);
  const result = await post(tx, wallet, {
    kind: 'SPONSORED_HOLD',
    amountMinor: -input.amountMinor,
    idempotencyKey: `campaign-hold:${input.campaignId}:${input.sequence}`,
    netMinor: -net,
    taxMinor: -(input.amountMinor - net),
    taxRateBasisPoints: input.taxRateBasisPoints,
    campaignId: input.campaignId,
    memo: input.sequence === 1 ? 'Sponsored campaign budget' : 'Sponsored campaign budget increase',
    actorUserId: input.actorUserId,
  });
  return result.posted ? { posted: true, entryId: result.entry.id } : { posted: false, balanceMinor: result.balanceMinor };
}

/** Return a campaign's unspent budget to the wallet, once (`campaign-refund:<campaign>`). */
export async function refundCampaignBudget(
  tx: Tx,
  organizationId: string,
  input: { campaignId: string; amountMinor: bigint; taxRateBasisPoints: number; actorUserId: string | null; reason: string },
) {
  const wallet = await lockWallet(tx, organizationId);
  const net = netOfGross(input.amountMinor, input.taxRateBasisPoints);
  const result = await post(tx, wallet, {
    kind: 'SPONSORED_REFUND',
    amountMinor: input.amountMinor,
    idempotencyKey: `campaign-refund:${input.campaignId}`,
    netMinor: net,
    taxMinor: input.amountMinor - net,
    taxRateBasisPoints: input.taxRateBasisPoints,
    campaignId: input.campaignId,
    memo: `Unspent sponsored budget: ${input.reason}`,
    actorUserId: input.actorUserId,
  });
  if (!result.posted) throw errors.internal('A refund cannot be refused for funds.');
  return result.entry;
}

// ---------------------------------------------------------------------------
// Refunds, reversals, disputes
// ---------------------------------------------------------------------------

/** Refund a lead's charge, once. Used when a dispute is upheld. */
export async function refundLead(tx: Tx, leadId: string, reason: string, actorUserId: string | null, requestId?: string) {
  const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (!lead.chargeEntryId || lead.billingStatus !== 'CHARGED') {
    throw errors.preconditionFailed('Only a charged lead can be refunded.');
  }
  const charge = await tx.ledgerEntry.findUniqueOrThrow({ where: { id: lead.chargeEntryId } });
  const wallet = await lockWallet(tx, lead.organizationId);
  const result = await post(tx, wallet, {
    kind: 'REFUND',
    amountMinor: -charge.amountMinor,
    idempotencyKey: `lead-refund:${lead.id}`,
    netMinor: charge.netMinor !== null ? -charge.netMinor : null,
    taxMinor: charge.taxMinor !== null ? -charge.taxMinor : null,
    taxRateBasisPoints: charge.taxRateBasisPoints,
    leadId: lead.id,
    reversesEntryId: charge.id,
    memo: reason,
    actorUserId,
  });
  if (!result.posted) throw errors.internal('A refund cannot be refused for funds.');
  await tx.lead.update({ where: { id: lead.id }, data: { billingStatus: 'REFUNDED' } });
  await tx.leadEvent.create({
    data: { id: newId('leadEvent'), leadId: lead.id, action: 'REFUNDED', fromStatus: lead.status, toStatus: lead.status, actorUserId, reason },
  });
  await emitInTransaction(tx, 'LEAD_REFUNDED', { leadId: lead.id, organizationId: lead.organizationId, entryId: result.entry.id, amountMinor: (-charge.amountMinor).toString() }, { requestId, actor: actorUserId ?? 'system' });
  return result.entry;
}

/**
 * Reverse a mistaken entry (for instance a credit recorded twice). Staff only.
 * Each entry can be reversed once. Reversing a credit that has already been
 * spent would breach the floor, and is refused by the same rule that stops
 * overdrafts.
 */
export async function reverseEntry(principal: Principal, entryId: string, reason: string, requestId?: string) {
  if (!can(principal, 'tl.billing.ledger.adjust')) throw errors.forbidden('tl.billing.ledger.adjust');
  if (reason.trim().length < 5) throw errors.validation('Give a reason for the reversal.', { field: 'reason' });
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;
  const entry = await db().ledgerEntry.findUnique({ where: { id: entryId }, include: { wallet: true } });
  if (!entry) throw errors.notFound('Ledger entry');
  if (entry.kind === 'LEAD_CHARGE') throw errors.preconditionFailed('A lead charge is corrected by refunding the lead, not by reversal.');
  if (entry.kind === 'REVERSAL' || entry.kind === 'REFUND') throw errors.preconditionFailed('A correction cannot itself be reversed.');

  return transaction(async (tx) => {
    const wallet = await lockWallet(tx, entry.wallet.organizationId);
    const result = await post(tx, wallet, {
      kind: 'REVERSAL',
      amountMinor: -entry.amountMinor,
      idempotencyKey: `reversal:${entry.id}`,
      netMinor: entry.netMinor !== null ? -entry.netMinor : null,
      taxMinor: entry.taxMinor !== null ? -entry.taxMinor : null,
      taxRateBasisPoints: entry.taxRateBasisPoints,
      reversesEntryId: entry.id,
      memo: reason,
      actorUserId,
    });
    if (!result.posted) throw errors.preconditionFailed('The wallet no longer holds enough to reverse this credit.');
    await recordAuditEvent({ action: 'LEDGER_REVERSED', actor: actorUserId ?? 'system', subject: entry.id, outcome: 'success', organizationId: entry.wallet.organizationId, requestId, detail: { reason } });
    return result.entry;
  });
}

export const disputeSchema = z.object({
  reason: z.enum(['DUPLICATE', 'SPAM', 'WRONG_CONTACT', 'OUT_OF_AREA', 'NOT_A_PATIENT', 'OTHER']),
  note: z.string().trim().max(1000).optional(),
});

/** How long after a charge a practice may dispute it. */
const DISPUTE_WINDOW_DAYS = 14;

export async function raiseDispute(principal: Principal, leadId: string, raw: z.input<typeof disputeSchema>, requestId?: string) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = disputeSchema.parse(raw);
  const lead = await db().lead.findUnique({ where: { id: leadId }, include: { dispute: true } });
  if (!lead || !can(principal, 'tl.billing.dispute.raise', { organizationId: lead.organizationId })) throw errors.notFound('Lead');
  if (lead.billingStatus !== 'CHARGED' || !lead.chargeEntryId) throw errors.preconditionFailed('Only a charged lead can be disputed.');
  if (lead.dispute) throw errors.conflict('This lead has already been disputed.');
  const charge = await db().ledgerEntry.findUniqueOrThrow({ where: { id: lead.chargeEntryId } });
  if (Date.now() - charge.createdAt.getTime() > DISPUTE_WINDOW_DAYS * 86_400_000) {
    throw errors.preconditionFailed(`Charges can be disputed for ${DISPUTE_WINDOW_DAYS} days.`);
  }
  if (input.reason === 'OTHER' && !input.note) throw errors.validation('Explain the dispute.', { field: 'note' });

  try {
    const dispute = await db().leadDispute.create({
      data: {
        id: newId('dispute'),
        leadId,
        organizationId: lead.organizationId,
        reason: input.reason,
        note: input.note ?? null,
        raisedByUserId: principal.userId,
      },
    });
    await recordAuditEvent({ action: 'LEAD_DISPUTE_RAISED', actor: principal.userId, subject: dispute.id, outcome: 'success', organizationId: lead.organizationId, requestId, detail: { leadId, reason: input.reason } });
    return dispute;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw errors.conflict('This lead has already been disputed.');
    throw error;
  }
}

export const resolveDisputeSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  note: z.string().trim().min(5, 'Explain the decision to the practice.').max(1000),
});

/** Staff decide a dispute. Upholding it refunds the lead in the same transaction. */
export async function resolveDispute(principal: Principal, disputeId: string, raw: z.input<typeof resolveDisputeSchema>, requestId?: string) {
  if (!can(principal, 'tl.billing.dispute.resolve')) throw errors.forbidden('tl.billing.dispute.resolve');
  const input = resolveDisputeSchema.parse(raw);
  const actorUserId = isAuthenticated(principal) ? principal.userId : null;
  const dispute = await db().leadDispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw errors.notFound('Dispute');
  if (actorUserId && dispute.raisedByUserId === actorUserId) throw errors.forbidden('tl.billing.dispute.resolve');

  const resolved = await transaction(async (tx) => {
    const claim = await tx.leadDispute.updateMany({
      where: { id: disputeId, status: 'OPEN' },
      data: { status: input.decision, resolvedByUserId: actorUserId, resolutionNote: input.note, resolvedAt: new Date() },
    });
    if (claim.count === 0) throw errors.conflict('This dispute has already been decided.');
    if (input.decision === 'ACCEPTED') {
      const refund = await refundLead(tx, dispute.leadId, `Dispute upheld: ${input.note}`, actorUserId, requestId);
      await tx.leadDispute.update({ where: { id: disputeId }, data: { refundEntryId: refund.id } });
    }
    return tx.leadDispute.findUniqueOrThrow({ where: { id: disputeId } });
  });
  await recordAuditEvent({ action: 'LEAD_DISPUTE_RESOLVED', actor: actorUserId ?? 'system', subject: disputeId, outcome: 'success', organizationId: dispute.organizationId, requestId, detail: { decision: input.decision } });
  return resolved;
}

// ---------------------------------------------------------------------------
// Statements (never tax invoices), summaries, integrity
// ---------------------------------------------------------------------------

/** Wording shown wherever a statement appears, so it is never read as a tax invoice. */
export const STATEMENT_NOTICE =
  'This is a statement of account for your lead wallet. It is not a GST tax invoice: Toothlogy does not issue tax invoices yet.';

/**
 * Issue (once) the monthly statement for charges and refunds in
 * [periodStart, periodEnd) not yet on another statement. Asking twice returns
 * the same statement. Stored in the `invoices` table for historical reasons;
 * numbered `STM-…` and presented only as a statement.
 */
export async function issueInvoice(organizationId: string, periodStart: Date, periodEnd: Date) {
  if (periodEnd <= periodStart) throw errors.validation('The period must end after it starts.');
  return transaction(async (tx) => {
    const wallet = await lockWallet(tx, organizationId);
    const existing = await tx.invoice.findUnique({ where: { walletId_periodStart_periodEnd: { walletId: wallet.id, periodStart, periodEnd } } });
    if (existing) return existing;
    const entries = await tx.ledgerEntry.findMany({
      where: { walletId: wallet.id, invoiceId: null, kind: { in: ['LEAD_CHARGE', 'REFUND'] }, createdAt: { gte: periodStart, lt: periodEnd } },
    });
    // What was billed: charges add, refunds subtract.
    const sign = (e: { kind: string }) => (e.kind === 'REFUND' ? -BigInt(1) : BigInt(1));
    const subtotal = entries.reduce((sum, e) => sum + sign(e) * abs(e.netMinor), ZERO);
    const tax = entries.reduce((sum, e) => sum + sign(e) * abs(e.taxMinor), ZERO);
    const id = newId('invoice');
    const period = periodStart.toISOString().slice(0, 7).replace('-', '');
    const invoice = await tx.invoice.create({
      data: {
        id,
        walletId: wallet.id,
        number: `STM-${period}-${id.slice(-8)}`,
        periodStart,
        periodEnd,
        currency: wallet.currency,
        subtotalMinor: subtotal,
        taxMinor: tax,
        totalMinor: subtotal + tax,
      },
    });
    if (entries.length > 0) {
      await tx.ledgerEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { invoiceId: invoice.id } });
    }
    return invoice;
  });
}

/**
 * The scheduled side of statements (job `billing.statements`): last month's
 * statement — the UTC calendar month, exactly as the on-demand route counts
 * it — for every wallet with lead charges or refunds not yet on a statement.
 * Safe to run any number of times: a wallet and period have one statement.
 */
export async function issueMonthlyStatements(now: Date = new Date()) {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const wallets = await db().ledgerEntry.findMany({
    where: { kind: { in: ['LEAD_CHARGE', 'REFUND'] }, invoiceId: null, createdAt: { gte: periodStart, lt: periodEnd } },
    select: { walletId: true, wallet: { select: { organizationId: true } } },
    distinct: ['walletId'],
  });
  for (const w of wallets) await issueInvoice(w.wallet.organizationId, periodStart, periodEnd);
  return { period: periodStart.toISOString().slice(0, 7), statements: wallets.length };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A statement of account for any date range (inclusive local dates in the
 * organization's timezone): opening balance, every movement by kind, closing
 * balance, the GST on leads, and how many leads were free, paid or waiting.
 * Read-only; recomputed from the ledger each time, and checked to reconcile.
 */
export async function accountStatement(principal: Principal, organizationId: string, fromDate: string, toDate: string) {
  if (!can(principal, 'tl.billing.wallet.read', { organizationId })) throw errors.notFound('Organization');
  if (!DATE.test(fromDate) || !DATE.test(toDate)) throw errors.validation('Dates must be YYYY-MM-DD.');
  if (toDate < fromDate) throw errors.validation('The end date must not be before the start date.', { field: 'to' });
  const organization = await db().organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, timezone: true, currency: true } });
  const tz = organization.timezone;
  const start = zonedToUtc(fromDate, 0, tz);
  const end = zonedToUtc(addDays(toDate, 1), 0, tz);
  if (end.getTime() - start.getTime() > 367 * 86_400_000) throw errors.validation('A statement covers at most one year.');

  const wallet = await transaction((tx) => walletFor(tx, organizationId));
  const [openingEntry, entries, leads] = await Promise.all([
    db().ledgerEntry.findFirst({ where: { walletId: wallet.id, createdAt: { lt: start } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    db().ledgerEntry.findMany({ where: { walletId: wallet.id, createdAt: { gte: start, lt: end } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db().lead.groupBy({ by: ['billingStatus'], where: { organizationId, billedAt: { gte: start, lt: end } }, _count: true }),
  ]);

  const opening = openingEntry?.balanceAfterMinor ?? ZERO;
  const sum = (kinds: string[], pick: (e: (typeof entries)[number]) => bigint | null) =>
    entries.filter((e) => kinds.includes(e.kind)).reduce((total, e) => total + (pick(e) ?? ZERO), ZERO);
  const count = (kinds: string[]) => entries.filter((e) => kinds.includes(e.kind)).length;

  const credits = sum(['TOP_UP', 'ADJUSTMENT'], (e) => e.amountMinor);
  const chargesGross = sum(['LEAD_CHARGE'], (e) => abs(e.amountMinor));
  const chargesNet = sum(['LEAD_CHARGE'], (e) => abs(e.netMinor));
  const chargesTax = sum(['LEAD_CHARGE'], (e) => abs(e.taxMinor));
  const refunds = sum(['REFUND'], (e) => abs(e.amountMinor));
  const refundsNet = sum(['REFUND'], (e) => abs(e.netMinor));
  const refundsTax = sum(['REFUND'], (e) => abs(e.taxMinor));
  const reversals = sum(['REVERSAL'], (e) => e.amountMinor);
  const sponsoredHeld = sum(['SPONSORED_HOLD'], (e) => abs(e.amountMinor));
  const sponsoredReturned = sum(['SPONSORED_REFUND'], (e) => abs(e.amountMinor));
  const sponsoredTax = sum(['SPONSORED_HOLD'], (e) => abs(e.taxMinor)) - sum(['SPONSORED_REFUND'], (e) => abs(e.taxMinor));
  const closing = entries.at(-1)?.balanceAfterMinor ?? opening;
  const leadCount = (s: string) => leads.find((l) => l.billingStatus === s)?._count ?? 0;

  return {
    kind: 'STATEMENT_OF_ACCOUNT' as const,
    isTaxInvoice: false as const,
    notice: STATEMENT_NOTICE,
    organization: { id: organizationId, name: organization.name },
    currency: wallet.currency,
    from: fromDate,
    to: toDate,
    timezone: tz,
    openingBalanceMinor: opening,
    creditsMinor: credits,
    creditCount: count(['TOP_UP', 'ADJUSTMENT']),
    leadCharges: { count: count(['LEAD_CHARGE']), netMinor: chargesNet, taxMinor: chargesTax, grossMinor: chargesGross },
    refunds: { count: count(['REFUND']), amountMinor: refunds, netMinor: refundsNet, taxMinor: refundsTax },
    reversals: { count: count(['REVERSAL']), amountMinor: reversals },
    /** Budgets held for sponsored campaigns, less what was returned unspent. */
    sponsored: { holds: count(['SPONSORED_HOLD']), heldMinor: sponsoredHeld, returnedMinor: sponsoredReturned, netMinor: sponsoredHeld - sponsoredReturned, gstMinor: sponsoredTax },
    /** Prime membership periods charged to the wallet, with their tax. */
    membership: {
      count: count(['MEMBERSHIP_CHARGE']),
      netMinor: sum(['MEMBERSHIP_CHARGE'], (e) => abs(e.netMinor)),
      taxMinor: sum(['MEMBERSHIP_CHARGE'], (e) => abs(e.taxMinor)),
      grossMinor: sum(['MEMBERSHIP_CHARGE'], (e) => abs(e.amountMinor)),
    },
    closingBalanceMinor: closing,
    /** GST on lead charges, less GST refunded with them. */
    gst: { chargedMinor: chargesTax, refundedMinor: refundsTax, netMinor: chargesTax - refundsTax },
    leads: {
      billed: leads.reduce((n, l) => n + l._count, 0),
      free: leadCount('FREE'),
      paid: leadCount('CHARGED') + leadCount('REFUNDED'),
      pendingFunds: leadCount('PENDING_FUNDS'),
      refunded: leadCount('REFUNDED'),
    },
    reconciles: opening + entries.reduce((total, e) => total + e.amountMinor, ZERO) === closing,
    lines: entries.map((e) => ({
      id: e.id,
      at: e.createdAt,
      kind: e.kind,
      amountMinor: e.amountMinor,
      netMinor: e.netMinor,
      taxMinor: e.taxMinor,
      balanceAfterMinor: e.balanceAfterMinor,
      reference: e.externalReference ?? e.memo,
    })),
  };
}

/** The sum of the ledger equals the cached balance, and every running balance chains. */
export async function verifyLedgerIntegrity(walletId: string): Promise<{ ok: boolean; balanceMinor: bigint; ledgerSumMinor: bigint; brokenAt: string | null }> {
  const wallet = await db().wallet.findUniqueOrThrow({ where: { id: walletId } });
  const entries = await db().ledgerEntry.findMany({ where: { walletId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  let running = ZERO;
  let brokenAt: string | null = null;
  for (const e of entries) {
    running += e.amountMinor;
    if (running !== e.balanceAfterMinor && !brokenAt) brokenAt = e.id;
  }
  return { ok: running === wallet.balanceMinor && brokenAt === null, balanceMinor: wallet.balanceMinor, ledgerSumMinor: running, brokenAt };
}

/** Free allowance used and left, for an organization. */
export async function freeLeadUsage(organizationId: string, allowance: number) {
  const used = await db().lead.count({ where: { organizationId, billingStatus: 'FREE' } });
  const billed = await db().lead.aggregate({ where: { organizationId }, _max: { billingOrdinal: true } });
  const decided = billed._max.billingOrdinal ?? 0;
  return { allowance, used, remaining: Math.max(allowance - decided, 0), decided };
}

/** Everything the billing page shows, for members who may read billing. */
export async function walletOverview(principal: Principal, organizationId: string) {
  if (!can(principal, 'tl.billing.wallet.read', { organizationId })) throw errors.notFound('Organization');
  const wallet = await transaction((tx) => walletFor(tx, organizationId));
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const [entries, invoices, pendingFunds, disputes, monthCharges] = await Promise.all([
    db().ledgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db().invoice.findMany({ where: { walletId: wallet.id }, orderBy: { periodStart: 'desc' }, take: 24 }),
    db().lead.count({ where: { organizationId, billingStatus: 'PENDING_FUNDS' } }),
    db().leadDispute.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db().ledgerEntry.aggregate({ where: { walletId: wallet.id, kind: 'LEAD_CHARGE', createdAt: { gte: monthStart } }, _sum: { amountMinor: true }, _count: true }),
  ]);
  let quote: PriceQuote | null = null;
  let recharge: RechargeQuote | null = null;
  let pricingError: string | null = null;
  try {
    quote = await orgQuote(organizationId);
    recharge = await rechargeQuote(organizationId);
  } catch (error) {
    pricingError = error instanceof Error ? error.message : 'Pricing is not configured.';
  }
  const free = quote ? await freeLeadUsage(organizationId, quote.freeLeadAllowance) : null;
  return {
    wallet,
    entries,
    invoices,
    pendingFunds,
    disputes,
    monthCharges: { count: monthCharges._count, grossMinor: -(monthCharges._sum.amountMinor ?? ZERO) },
    quote,
    recharge,
    free,
    pricingError,
    topUpAvailable: paymentProvider.isConfigured(),
  };
}
