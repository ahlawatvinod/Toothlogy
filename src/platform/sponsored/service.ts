/**
 * TOOTHLOGY SPONSORED PLACEMENT — campaigns, budgets, spend
 *
 * A Prime campaign promotes one dentist at one branch ("Prime dentist") or a
 * whole clinic or hospital ("Prime clinic" / "Prime hospital") in clearly
 * labelled Sponsored slots — on search pages and on other profiles. Organic
 * ranking never reads anything here (see serve.ts).
 *
 * MONEY
 * - Activating holds the whole budget from the organization's wallet as one
 *   ledger entry (SPONSORED_HOLD). Too little in the wallet: activation is
 *   refused and nothing moves. The wallet never goes negative (its CHECK).
 * - Each day the campaign runs costs its daily rate: (held − spent) spread over
 *   the days left. A day is charged once — SponsoredCampaignDay is unique per
 *   campaign and date — and never beyond what was held (a CHECK on the
 *   campaign row). Clicks are counted, never charged, so clicking your own ad
 *   costs nothing and inflating clicks gains nothing.
 * - Ending, exhausting or cancelling refunds what was held but not spent
 *   (SPONSORED_REFUND), once, keyed by the campaign.
 *
 * Every rule that is a business decision — the minimum daily budget, the
 * number of slots, the longest campaign — is a SponsoredPlacementSettings row.
 */

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { emitInTransaction } from '../events/outbox';
import { can, isAuthenticated, type Principal } from '../rbac';
import { requireTaxRate, type TaxCategory } from '../tax';
import { formatMoney } from '../money';
import { TREATMENTS } from '../catalogue/treatments';
import { holdCampaignBudget, netOfGross, refundCampaignBudget } from '../billing/service';
import { addDays, localDateOf, zonedToUtc } from '@/lib/zoned-time';

type Tx = Prisma.TransactionClient;
type Campaign = Prisma.SponsoredCampaignGetPayload<object>;

const ZERO = BigInt(0);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FINAL_STATUSES = ['ENDED', 'EXHAUSTED', 'CANCELLED'] as const;
const OPEN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED'] as const;
export const CAMPAIGN_GEOFENCE_OWNER = 'sponsored_campaign';
/** The most a single campaign may hold, in minor units: a guard against typos. */
const MAX_BUDGET_MINOR = BigInt(100_000_000);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Local dates from `start` to `end`, both included. */
export function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** "Prime dentist", "Prime clinic" or "Prime hospital" — what the campaign buys. */
export function primeTier(subjectType: 'PRACTICE' | 'ORGANIZATION', organizationType: string): string {
  if (subjectType === 'PRACTICE') return 'Prime dentist';
  return organizationType === 'HOSPITAL' ? 'Prime hospital' : 'Prime clinic';
}

// ---------------------------------------------------------------------------
// Configuration and access
// ---------------------------------------------------------------------------

export async function placementSettings(countryCode: string) {
  const settings = await db().sponsoredPlacementSettings.findFirst({ where: { countryCode: countryCode.toUpperCase(), isActive: true } });
  if (!settings) throw errors.preconditionFailed(`Sponsored placement is not configured for ${countryCode}.`);
  return settings;
}

export function canManageCampaigns(principal: Principal, organizationId: string): boolean {
  return can(principal, 'tl.advertising.campaign.manage', { organizationId }) || can(principal, 'tl.advertising.campaign.administer');
}

/** Another organization's campaign does not exist, as far as this caller knows. */
async function loadCampaign(principal: Principal, campaignId: string): Promise<Campaign> {
  const campaign = await db().sponsoredCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !canManageCampaigns(principal, campaign.organizationId)) throw errors.notFound('Campaign');
  return campaign;
}

function actorOf(principal: Principal): string {
  return isAuthenticated(principal) ? principal.userId : 'system';
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const TREATMENT_KEYS = new Set(TREATMENTS.map((t) => t.key));

export const campaignInputSchema = z.object({
  name: z.string().trim().min(3, 'Name the campaign.').max(120),
  subjectType: z.enum(['PRACTICE', 'ORGANIZATION']),
  practiceId: z.string().max(64).nullable().optional(),
  searchPlacement: z.boolean().default(true),
  profilePlacement: z.boolean().default(false),
  startDate: z.string().regex(DATE, 'Use YYYY-MM-DD.'),
  endDate: z.string().regex(DATE, 'Use YYYY-MM-DD.'),
  budgetMinor: z.coerce.bigint(),
  targetTreatmentKeys: z.array(z.string().max(60)).max(20).default([]),
  targetAppointmentTypes: z.array(z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT'])).max(3).default([]),
  /** Show only to searches within this distance of the promoted branch. Null: anywhere. */
  targetRadiusKm: z.number().int().min(1).max(100).nullable().optional(),
});
export type CampaignInput = z.input<typeof campaignInputSchema>;

export const campaignUpdateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  searchPlacement: z.boolean().optional(),
  profilePlacement: z.boolean().optional(),
  startDate: z.string().regex(DATE).optional(),
  endDate: z.string().regex(DATE).optional(),
  budgetMinor: z.coerce.bigint().optional(),
  targetTreatmentKeys: z.array(z.string().max(60)).max(20).optional(),
  targetAppointmentTypes: z.array(z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT'])).max(3).optional(),
  targetRadiusKm: z.number().int().min(1).max(100).nullable().optional(),
});

interface Subject {
  organization: { id: string; name: string; type: string; countryCode: string; timezone: string; currency: string };
  centre: { latitude: number; longitude: number } | null;
  tier: string;
}

/**
 * The thing being promoted must belong to this organization and be something
 * a patient could book: a confirmed practice of a discoverable (verified)
 * dentist, or a currently verified clinic or hospital.
 */
async function validateSubject(organizationId: string, subjectType: 'PRACTICE' | 'ORGANIZATION', practiceId: string | null | undefined, now: Date): Promise<Subject> {
  const organization = await db().organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, type: true, status: true, deletedAt: true, verifiedAt: true, verificationExpires: true, countryCode: true, timezone: true, currency: true },
  });
  // Suspended or closed organizations cannot promote anything. A PENDING
  // (not yet verified) clinic may still promote its verified dentists — the
  // same rule as search — but not itself (checked below).
  if (!organization || organization.deletedAt || !['ACTIVE', 'PENDING'].includes(organization.status)) throw errors.notFound('Organization');
  if (organization.type !== 'CLINIC' && organization.type !== 'HOSPITAL') {
    throw errors.validation('Only clinics and hospitals can run Prime campaigns.', { field: 'subjectType' });
  }

  if (subjectType === 'PRACTICE') {
    if (!practiceId) throw errors.validation('Choose the dentist to promote.', { field: 'practiceId' });
    const practice = await db().dentistPractice.findUnique({
      where: { id: practiceId },
      select: {
        isConfirmed: true,
        dentistProfile: { select: { isDiscoverable: true, deletedAt: true } },
        location: { select: { organizationId: true, deletedAt: true, status: true, latitude: true, longitude: true } },
      },
    });
    // Someone else's practice reads as missing, not as forbidden.
    if (!practice || practice.location.organizationId !== organizationId) throw errors.notFound('Practice');
    if (!practice.isConfirmed || practice.location.deletedAt || practice.location.status !== 'ACTIVE') {
      throw errors.validation('That dentist is not confirmed at an active branch of this organization.', { field: 'practiceId' });
    }
    if (!practice.dentistProfile.isDiscoverable || practice.dentistProfile.deletedAt) {
      throw errors.validation('Only a verified, listed dentist can be promoted.', { field: 'practiceId' });
    }
    const { latitude, longitude } = practice.location;
    return {
      organization,
      centre: latitude !== null && longitude !== null ? { latitude: Number(latitude), longitude: Number(longitude) } : null,
      tier: primeTier('PRACTICE', organization.type),
    };
  }

  if (practiceId) throw errors.validation('An organization campaign promotes the whole organization, not one dentist.', { field: 'practiceId' });
  const verified = organization.verifiedAt !== null && (organization.verificationExpires === null || organization.verificationExpires > now);
  if (!verified) throw errors.validation('Only a verified clinic or hospital can be promoted.', { field: 'subjectType' });
  const primary = await db().location.findFirst({
    where: { organizationId, deletedAt: null, status: 'ACTIVE' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    select: { latitude: true, longitude: true },
  });
  return {
    organization,
    centre: primary && primary.latitude !== null && primary.longitude !== null ? { latitude: Number(primary.latitude), longitude: Number(primary.longitude) } : null,
    tier: primeTier('ORGANIZATION', organization.type),
  };
}

function validateTargeting(input: { targetTreatmentKeys?: readonly string[]; targetRadiusKm?: number | null }, centre: Subject['centre']) {
  const unknown = (input.targetTreatmentKeys ?? []).filter((k) => !TREATMENT_KEYS.has(k));
  if (unknown.length > 0) throw errors.validation(`Unknown treatment: ${unknown.join(', ')}.`, { field: 'targetTreatmentKeys' });
  if (input.targetRadiusKm && !centre) throw errors.validation('The branch has no map location, so it cannot be targeted by distance.', { field: 'targetRadiusKm' });
}

async function validateDatesAndBudget(
  settings: { minimumDailyBudgetMinor: bigint; maxCampaignDays: number; currency: string },
  timezone: string,
  startDate: string,
  endDate: string,
  budgetMinor: bigint,
  now: Date,
): Promise<{ days: number; startsAt: Date; endsAt: Date }> {
  const today = localDateOf(now, timezone);
  if (startDate < today) throw errors.validation('The start date has passed.', { field: 'startDate' });
  if (endDate < startDate) throw errors.validation('The campaign must end on or after its start date.', { field: 'endDate' });
  const days = daysInclusive(startDate, endDate);
  if (days > settings.maxCampaignDays) throw errors.validation(`A campaign runs for at most ${settings.maxCampaignDays} days.`, { field: 'endDate' });
  const minimum = settings.minimumDailyBudgetMinor * BigInt(days);
  if (budgetMinor <= ZERO || budgetMinor > MAX_BUDGET_MINOR) throw errors.validation('Enter a budget.', { field: 'budgetMinor' });
  if (budgetMinor < minimum) {
    throw errors.validation(
      `The budget must be at least ${formatMoney({ amountMinor: settings.minimumDailyBudgetMinor, currency: settings.currency }, 'en-IN')} a day including GST: ${formatMoney({ amountMinor: minimum, currency: settings.currency }, 'en-IN')} for ${days} day${days === 1 ? '' : 's'}.`,
      { field: 'budgetMinor', minimumMinor: minimum.toString() },
    );
  }
  return { days, startsAt: zonedToUtc(startDate, 0, timezone), endsAt: zonedToUtc(addDays(endDate, 1), 0, timezone) };
}

/** One open campaign per promoted thing and placement at a time. */
async function assertNoDuplicate(
  client: Pick<Tx, 'sponsoredCampaign'>,
  c: { id?: string; organizationId: string; subjectType: string; practiceId: string | null; startsAt: Date; endsAt: Date; searchPlacement: boolean; profilePlacement: boolean },
) {
  const clash = await client.sponsoredCampaign.findFirst({
    where: {
      id: c.id ? { not: c.id } : undefined,
      organizationId: c.organizationId,
      subjectType: c.subjectType as 'PRACTICE' | 'ORGANIZATION',
      practiceId: c.practiceId,
      status: { in: [...OPEN_STATUSES] },
      startsAt: { lt: c.endsAt },
      endsAt: { gt: c.startsAt },
      OR: [...(c.searchPlacement ? [{ searchPlacement: true }] : []), ...(c.profilePlacement ? [{ profilePlacement: true }] : [])],
    },
    select: { id: true, name: true },
  });
  if (clash) throw errors.conflict(`“${clash.name}” already promotes this in the same placement for overlapping dates.`);
}

async function setLocationTarget(tx: Tx, campaignId: string, centre: Subject['centre'], radiusKm: number | null | undefined) {
  await tx.geofence.updateMany({ where: { ownerType: CAMPAIGN_GEOFENCE_OWNER, ownerId: campaignId, purpose: 'CAMPAIGN' }, data: { isActive: false } });
  if (!radiusKm || !centre) return;
  await tx.geofence.create({
    data: {
      id: newId('geofence'),
      name: `Campaign ${campaignId} target`,
      kind: 'RADIUS',
      centreLatitude: centre.latitude,
      centreLongitude: centre.longitude,
      radiusMetres: radiusKm * 1000,
      ownerType: CAMPAIGN_GEOFENCE_OWNER,
      ownerId: campaignId,
      purpose: 'CAMPAIGN',
    },
  });
}

// ---------------------------------------------------------------------------
// Create, edit
// ---------------------------------------------------------------------------

export async function createCampaign(principal: Principal, organizationId: string, raw: CampaignInput, context: { requestId?: string; now?: Date } = {}) {
  if (!isAuthenticated(principal) || !canManageCampaigns(principal, organizationId)) throw errors.notFound('Organization');
  const input = campaignInputSchema.parse(raw);
  const now = context.now ?? new Date();
  if (!input.searchPlacement && !input.profilePlacement) throw errors.validation('Choose at least one placement.', { field: 'searchPlacement' });
  const subject = await validateSubject(organizationId, input.subjectType, input.practiceId, now);
  const settings = await placementSettings(subject.organization.countryCode);
  validateTargeting(input, subject.centre);
  const { startsAt, endsAt } = await validateDatesAndBudget(settings, subject.organization.timezone, input.startDate, input.endDate, input.budgetMinor, now);
  const practiceId = input.subjectType === 'PRACTICE' ? input.practiceId! : null;

  const id = newId('campaign');
  const campaign = await transaction(async (tx) => {
    // The organization's wallet row serializes its campaign changes too.
    await tx.$queryRaw`SELECT "id" FROM "organizations" WHERE "id" = ${organizationId} FOR UPDATE`;
    await assertNoDuplicate(tx, { organizationId, subjectType: input.subjectType, practiceId, startsAt, endsAt, searchPlacement: input.searchPlacement, profilePlacement: input.profilePlacement });
    const created = await tx.sponsoredCampaign.create({
      data: {
        id,
        organizationId,
        subjectType: input.subjectType,
        practiceId,
        name: input.name,
        searchPlacement: input.searchPlacement,
        profilePlacement: input.profilePlacement,
        startsAt,
        endsAt,
        timezone: subject.organization.timezone,
        currency: settings.currency,
        budgetMinor: input.budgetMinor,
        targetTreatmentKeys: input.targetTreatmentKeys,
        targetAppointmentTypes: input.targetAppointmentTypes,
        createdByUserId: principal.userId,
      },
    });
    await setLocationTarget(tx, id, subject.centre, input.targetRadiusKm);
    return created;
  });
  await recordAuditEvent({ action: 'CAMPAIGN_CREATED', actor: principal.userId, subject: id, outcome: 'success', organizationId, requestId: context.requestId, detail: { subjectType: input.subjectType, budgetMinor: input.budgetMinor.toString() } });
  return campaign;
}

/**
 * Edit a campaign. A draft can change anything; a running (or paused)
 * campaign can change its name and targeting and add to its budget — the
 * extra is held from the wallet at once. A closed campaign cannot change.
 */
export async function updateCampaign(principal: Principal, campaignId: string, raw: z.input<typeof campaignUpdateSchema>, context: { requestId?: string; now?: Date } = {}) {
  const input = campaignUpdateSchema.parse(raw);
  const now = context.now ?? new Date();
  const existing = await loadCampaign(principal, campaignId);
  if ((FINAL_STATUSES as readonly string[]).includes(existing.status)) throw errors.preconditionFailed(`A ${existing.status.toLowerCase()} campaign cannot be changed.`);
  const subject = await validateSubject(existing.organizationId, existing.subjectType, existing.practiceId, now);
  const settings = await placementSettings(subject.organization.countryCode);
  validateTargeting(input, subject.centre);

  const running = existing.status !== 'DRAFT';
  if (running && (input.startDate || input.endDate || input.searchPlacement !== undefined || input.profilePlacement !== undefined)) {
    throw errors.preconditionFailed('Dates and placements are fixed once a campaign is running. Cancel it and create a new one instead.');
  }
  if (running && input.budgetMinor !== undefined && input.budgetMinor < existing.budgetMinor) {
    throw errors.preconditionFailed('A running campaign’s budget can only be increased. Cancel it to get the unspent budget back.');
  }

  const startDate = input.startDate ?? localDateOf(existing.startsAt, existing.timezone);
  const endDate = input.endDate ?? addDays(localDateOf(existing.endsAt, existing.timezone), -1);
  const budget = input.budgetMinor ?? existing.budgetMinor;
  let dates = { startsAt: existing.startsAt, endsAt: existing.endsAt };
  if (!running) {
    dates = await validateDatesAndBudget(settings, existing.timezone, startDate, endDate, budget, now);
  }
  const searchPlacement = input.searchPlacement ?? existing.searchPlacement;
  const profilePlacement = input.profilePlacement ?? existing.profilePlacement;
  if (!searchPlacement && !profilePlacement) throw errors.validation('Choose at least one placement.', { field: 'searchPlacement' });

  const actor = actorOf(principal);
  const updated = await transaction(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ status: string; heldMinor: bigint; spentMinor: bigint; holdCount: number }>>`
      SELECT "status", "heldMinor", "spentMinor", "holdCount" FROM "sponsored_campaigns" WHERE "id" = ${campaignId} FOR UPDATE`;
    if (!row || row.status !== existing.status) throw errors.conflict('This campaign changed while you were editing it. Refresh and try again.');
    if (!running) await assertNoDuplicate(tx, { id: campaignId, organizationId: existing.organizationId, subjectType: existing.subjectType, practiceId: existing.practiceId, ...dates, searchPlacement, profilePlacement });

    const data: Prisma.SponsoredCampaignUpdateInput = {
      name: input.name,
      searchPlacement,
      profilePlacement,
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
      budgetMinor: budget,
      targetTreatmentKeys: input.targetTreatmentKeys,
      targetAppointmentTypes: input.targetAppointmentTypes,
    };

    const increase = running ? budget - existing.budgetMinor : ZERO;
    if (increase > ZERO) {
      const rate = await requireTaxRate(subject.organization.countryCode, settings.taxCategory as TaxCategory, now);
      const held = await holdCampaignBudget(tx, existing.organizationId, {
        campaignId,
        amountMinor: increase,
        sequence: row.holdCount + 1,
        taxRateBasisPoints: rate.rateBasisPoints,
        actorUserId: actor === 'system' ? null : actor,
      });
      if (!held.posted) {
        throw errors.preconditionFailed(`Your wallet holds ${formatMoney({ amountMinor: held.balanceMinor, currency: existing.currency }, 'en-IN')}; adding ${formatMoney({ amountMinor: increase, currency: existing.currency }, 'en-IN')} needs more. Recharge first.`);
      }
      const newHeld = row.heldMinor + increase;
      // Spread what is left over the days still to run: today counts only if
      // it has not been charged yet.
      const chargedToday = (await tx.sponsoredCampaignDay.count({ where: { campaignId, localDate: localDateOf(now, existing.timezone) } })) > 0;
      Object.assign(data, { heldMinor: newHeld, holdCount: row.holdCount + 1, dailyRateMinor: dailyRateFor(newHeld - row.spentMinor, existing, now, chargedToday) });
    }
    const result = await tx.sponsoredCampaign.update({ where: { id: campaignId }, data });
    if (input.targetRadiusKm !== undefined) await setLocationTarget(tx, campaignId, subject.centre, input.targetRadiusKm);
    return result;
  });
  await recordAuditEvent({ action: 'CAMPAIGN_UPDATED', actor, subject: campaignId, outcome: 'success', organizationId: existing.organizationId, requestId: context.requestId, detail: { fields: Object.keys(input), budgetMinor: budget.toString() } });
  return updated;
}

/** What is left, spread over the days left (today included if not yet charged). */
function dailyRateFor(remaining: bigint, c: { startsAt: Date; endsAt: Date; timezone: string }, now: Date, todayCharged = false): bigint {
  const first = localDateOf(now > c.startsAt ? now : c.startsAt, c.timezone);
  const from = todayCharged ? addDays(first, 1) : first;
  const last = addDays(localDateOf(c.endsAt, c.timezone), -1);
  const days = Math.max(daysInclusive(from, last), 1);
  return remaining > ZERO ? remaining / BigInt(days) : ZERO;
}

// ---------------------------------------------------------------------------
// Lifecycle: activate, pause, resume, cancel
// ---------------------------------------------------------------------------

export const campaignActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'PAUSE', 'RESUME', 'CANCEL']),
  reason: z.string().trim().max(300).optional(),
});

export async function actOnCampaign(principal: Principal, campaignId: string, raw: z.input<typeof campaignActionSchema>, context: { requestId?: string; now?: Date } = {}) {
  const { action, reason } = campaignActionSchema.parse(raw);
  const now = context.now ?? new Date();
  const campaign = await loadCampaign(principal, campaignId);
  const actor = actorOf(principal);

  if (action === 'ACTIVATE') {
    if (campaign.status !== 'DRAFT') throw errors.preconditionFailed(`A ${campaign.status.toLowerCase()} campaign cannot be activated.`);
    const subject = await validateSubject(campaign.organizationId, campaign.subjectType, campaign.practiceId, now);
    const settings = await placementSettings(subject.organization.countryCode);
    const startDate = localDateOf(campaign.startsAt, campaign.timezone);
    const endDate = addDays(localDateOf(campaign.endsAt, campaign.timezone), -1);
    const { days } = await validateDatesAndBudget(settings, campaign.timezone, startDate, endDate, campaign.budgetMinor, now);
    const rate = await requireTaxRate(subject.organization.countryCode, settings.taxCategory as TaxCategory, now);

    await transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ status: string }>>`SELECT "status" FROM "sponsored_campaigns" WHERE "id" = ${campaignId} FOR UPDATE`;
      if (!row || row.status !== 'DRAFT') throw errors.conflict('This campaign was changed at the same moment. Refresh and try again.');
      await assertNoDuplicate(tx, campaign);
      const held = await holdCampaignBudget(tx, campaign.organizationId, {
        campaignId,
        amountMinor: campaign.budgetMinor,
        sequence: 1,
        taxRateBasisPoints: rate.rateBasisPoints,
        actorUserId: actor === 'system' ? null : actor,
      });
      if (!held.posted) {
        throw errors.preconditionFailed(
          `Your wallet holds ${formatMoney({ amountMinor: held.balanceMinor, currency: campaign.currency }, 'en-IN')}; this campaign needs ${formatMoney({ amountMinor: campaign.budgetMinor, currency: campaign.currency }, 'en-IN')} including GST. Recharge first.`,
          { code: 'INSUFFICIENT_FUNDS' },
        );
      }
      await tx.sponsoredCampaign.update({
        where: { id: campaignId },
        data: { status: 'ACTIVE', heldMinor: campaign.budgetMinor, holdCount: 1, dailyRateMinor: campaign.budgetMinor / BigInt(days), activatedAt: now },
      });
      await emitInTransaction(tx, 'SPONSORED_CAMPAIGN_ACTIVATED', { campaignId, organizationId: campaign.organizationId, heldMinor: campaign.budgetMinor.toString(), currency: campaign.currency }, { requestId: context.requestId, actor });
    });
    await accrueCampaign(campaignId, now);
  } else if (action === 'PAUSE' || action === 'RESUME') {
    const from = action === 'PAUSE' ? 'ACTIVE' : 'PAUSED';
    if (campaign.status !== from) throw errors.preconditionFailed(`A ${campaign.status.toLowerCase()} campaign cannot be ${action === 'PAUSE' ? 'paused' : 'resumed'}.`);
    if (action === 'RESUME' && now >= campaign.endsAt) throw errors.preconditionFailed('This campaign’s end date has passed.');
    const claim = await db().sponsoredCampaign.updateMany({
      where: { id: campaignId, status: from },
      data: action === 'PAUSE' ? { status: 'PAUSED', pausedAt: now } : { status: 'ACTIVE', pausedAt: null },
    });
    if (claim.count === 0) throw errors.conflict('This campaign was changed at the same moment. Refresh and try again.');
    if (action === 'RESUME') await accrueCampaign(campaignId, now);
  } else {
    if ((FINAL_STATUSES as readonly string[]).includes(campaign.status)) throw errors.preconditionFailed(`This campaign is already ${campaign.status.toLowerCase()}.`);
    await transaction(async (tx) => closeCampaign(tx, campaignId, 'CANCELLED', reason ?? 'Cancelled', actor, now));
  }

  await recordAuditEvent({ action: `CAMPAIGN_${action}`, actor, subject: campaignId, outcome: 'success', organizationId: campaign.organizationId, requestId: context.requestId, detail: reason ? { reason } : undefined });
  return db().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaignId } });
}

/**
 * Close a campaign and refund what was held but not spent — once. Runs inside
 * the caller's transaction; locks the campaign row.
 */
async function closeCampaign(tx: Tx, campaignId: string, status: 'ENDED' | 'EXHAUSTED' | 'CANCELLED', reason: string, actor: string, now: Date) {
  const [row] = await tx.$queryRaw<Array<{ status: string; heldMinor: bigint; spentMinor: bigint; refundedMinor: bigint; organizationId: string; currency: string; timezone: string }>>`
    SELECT "status", "heldMinor", "spentMinor", "refundedMinor", "organizationId", "currency", "timezone" FROM "sponsored_campaigns" WHERE "id" = ${campaignId} FOR UPDATE`;
  if (!row || (FINAL_STATUSES as readonly string[]).includes(row.status)) return false;
  const unspent = row.heldMinor - row.spentMinor - row.refundedMinor;
  if (unspent > ZERO) {
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: row.organizationId }, select: { countryCode: true } });
    const settings = await tx.sponsoredPlacementSettings.findFirst({ where: { countryCode: organization.countryCode } });
    const rate = await requireTaxRate(organization.countryCode, (settings?.taxCategory ?? 'platform_fees') as TaxCategory, now);
    await refundCampaignBudget(tx, row.organizationId, { campaignId, amountMinor: unspent, taxRateBasisPoints: rate.rateBasisPoints, actorUserId: actor === 'system' ? null : actor, reason });
  }
  await tx.sponsoredCampaign.update({
    where: { id: campaignId },
    data: { status, closedAt: now, closeReason: reason, refundedMinor: row.refundedMinor + (unspent > ZERO ? unspent : ZERO), dailyRateMinor: ZERO },
  });
  await emitInTransaction(
    tx,
    'SPONSORED_CAMPAIGN_CLOSED',
    { campaignId, organizationId: row.organizationId, status, reason, spentMinor: row.spentMinor.toString(), refundedMinor: (unspent > ZERO ? unspent : ZERO).toString(), currency: row.currency },
    { actor },
  );
  return true;
}

// ---------------------------------------------------------------------------
// Spend: one charge per running day
// ---------------------------------------------------------------------------

/**
 * Charge today's share for one running campaign, close it if its dates or
 * budget are done. Idempotent: the day row is unique, and everything happens
 * under a lock on the campaign.
 */
export async function accrueCampaign(campaignId: string, now: Date = new Date()): Promise<'CHARGED' | 'ALREADY' | 'CLOSED' | 'IDLE'> {
  return transaction(async (tx) => {
    const [c] = await tx.$queryRaw<Array<{ status: string; startsAt: Date; endsAt: Date; timezone: string; heldMinor: bigint; spentMinor: bigint; refundedMinor: bigint; dailyRateMinor: bigint; organizationId: string }>>`
      SELECT "status", "startsAt", "endsAt", "timezone", "heldMinor", "spentMinor", "refundedMinor", "dailyRateMinor", "organizationId"
      FROM "sponsored_campaigns" WHERE "id" = ${campaignId} FOR UPDATE`;
    if (!c || (FINAL_STATUSES as readonly string[]).includes(c.status) || c.status === 'DRAFT') return 'IDLE';
    if (now >= c.endsAt) {
      await closeCampaign(tx, campaignId, 'ENDED', 'The campaign reached its end date.', 'system', now);
      return 'CLOSED';
    }
    if (c.status !== 'ACTIVE' || now < c.startsAt) return 'IDLE';
    const remaining = c.heldMinor - c.spentMinor - c.refundedMinor;
    if (remaining <= ZERO) {
      await closeCampaign(tx, campaignId, 'EXHAUSTED', 'The budget is spent.', 'system', now);
      return 'CLOSED';
    }
    const amount = c.dailyRateMinor < remaining ? c.dailyRateMinor : remaining;
    if (amount <= ZERO) return 'IDLE';
    const organization = await tx.organization.findUniqueOrThrow({ where: { id: c.organizationId }, select: { countryCode: true } });
    const settings = await tx.sponsoredPlacementSettings.findFirst({ where: { countryCode: organization.countryCode } });
    const rate = await requireTaxRate(organization.countryCode, (settings?.taxCategory ?? 'platform_fees') as TaxCategory, now);
    const localDate = localDateOf(now, c.timezone);
    const inserted = await tx.sponsoredCampaignDay.createMany({
      data: [{ id: newId('campaignDay'), campaignId, localDate, amountMinor: amount, taxMinor: amount - netOfGross(amount, rate.rateBasisPoints) }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return 'ALREADY';
    const spent = c.spentMinor + amount;
    await tx.sponsoredCampaign.update({ where: { id: campaignId }, data: { spentMinor: spent } });
    if (spent + c.refundedMinor >= c.heldMinor) await closeCampaign(tx, campaignId, 'EXHAUSTED', 'The budget is spent.', 'system', now);
    return 'CHARGED';
  });
}

/** The job: every running campaign's day, and every campaign whose dates are done. */
export async function accrueAllCampaigns(now: Date = new Date()) {
  const due = await db().sponsoredCampaign.findMany({
    where: { OR: [{ status: 'ACTIVE', startsAt: { lte: now } }, { status: { in: ['ACTIVE', 'PAUSED'] }, endsAt: { lte: now } }] },
    select: { id: true },
    take: 1000,
  });
  const outcome = { charged: 0, closed: 0 };
  for (const { id } of due) {
    const result = await accrueCampaign(id, now);
    if (result === 'CHARGED') outcome.charged += 1;
    if (result === 'CLOSED') outcome.closed += 1;
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Reading and analytics
// ---------------------------------------------------------------------------

const CAMPAIGN_INCLUDE = {
  organization: { select: { name: true, slug: true, type: true } },
  practice: { select: { id: true, dentistProfile: { select: { slug: true, user: { select: { displayName: true } } } }, location: { select: { name: true } } } },
} satisfies Prisma.SponsoredCampaignInclude;

export async function listCampaigns(principal: Principal, organizationId: string) {
  if (!canManageCampaigns(principal, organizationId)) throw errors.notFound('Organization');
  return db().sponsoredCampaign.findMany({ where: { organizationId }, include: CAMPAIGN_INCLUDE, orderBy: { createdAt: 'desc' }, take: 200 });
}

export async function listAllCampaigns(principal: Principal, filter: { status?: string } = {}) {
  if (!can(principal, 'tl.advertising.campaign.administer')) throw errors.forbidden('tl.advertising.campaign.administer');
  return db().sponsoredCampaign.findMany({
    where: filter.status ? { status: filter.status as Campaign['status'] } : {},
    include: CAMPAIGN_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

export async function getCampaign(principal: Principal, campaignId: string) {
  await loadCampaign(principal, campaignId);
  const [campaign, fence, audit] = await Promise.all([
    db().sponsoredCampaign.findUniqueOrThrow({ where: { id: campaignId }, include: { ...CAMPAIGN_INCLUDE, days: { orderBy: { localDate: 'asc' } } } }),
    db().geofence.findFirst({ where: { ownerType: CAMPAIGN_GEOFENCE_OWNER, ownerId: campaignId, purpose: 'CAMPAIGN', isActive: true } }),
    db().auditEvent.findMany({ where: { subject: campaignId }, orderBy: { occurredAt: 'asc' }, take: 100 }),
  ]);
  return {
    campaign,
    tier: primeTier(campaign.subjectType, campaign.organization.type),
    targetRadiusKm: fence?.radiusMetres ? Math.round(fence.radiusMetres / 1000) : null,
    audit,
    analytics: await campaignAnalytics(campaign),
  };
}

/**
 * Sponsored results only — impressions, clicks, profile views and booking
 * clicks this campaign produced (excluding the organization's own), the leads
 * and conversions attributed to those clicks, and the money. Organic numbers
 * are reported separately by `organicComparison`, never blended in.
 */
export async function campaignAnalytics(campaign: Campaign) {
  const [events, excluded, leads, conversions] = await Promise.all([
    db().sponsoredEvent.groupBy({ by: ['kind'], where: { campaignId: campaign.id, excluded: false }, _count: true }),
    db().sponsoredEvent.count({ where: { campaignId: campaign.id, excluded: true } }),
    db().lead.count({ where: { campaignId: campaign.id } }),
    db().lead.count({ where: { campaignId: campaign.id, status: 'CONVERTED' } }),
  ]);
  const count = (k: string) => events.find((e) => e.kind === k)?._count ?? 0;
  const impressions = count('IMPRESSION');
  const clicks = count('CLICK');
  const remaining = campaign.status === 'DRAFT' ? campaign.budgetMinor : campaign.heldMinor - campaign.spentMinor - campaign.refundedMinor;
  return {
    impressions,
    clicks,
    clickThroughRate: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : null,
    profileViews: count('PROFILE_VIEW'),
    bookingClicks: count('BOOK_CLICK'),
    excludedEvents: excluded,
    leads,
    conversions,
    spentMinor: campaign.spentMinor,
    refundedMinor: campaign.refundedMinor,
    remainingMinor: remaining > ZERO ? remaining : ZERO,
    costPerLeadMinor: leads > 0 ? campaign.spentMinor / BigInt(leads) : null,
  };
}

/** Organic leads for the same organization, over the same dates: never mixed into sponsored figures. */
export async function organicComparison(campaign: Campaign) {
  const where = { organizationId: campaign.organizationId, campaignId: null, createdAt: { gte: campaign.startsAt, lt: campaign.endsAt } };
  const [leads, conversions] = await Promise.all([db().lead.count({ where }), db().lead.count({ where: { ...where, status: 'CONVERTED' } })]);
  return { leads, conversions };
}
