/**
 * TOOTHLOGY DENTIST PRICING SERVICE
 *
 * A dentist's own price list: reading it, editing it, and — the part that
 * matters most — never letting one dentist touch another's.
 *
 * OWNERSHIP IS RESOLVED, NEVER ACCEPTED
 * Every function here takes a `userId` from the session and looks the dentist
 * profile up from it. None takes a `dentistProfileId` from the caller. That is
 * deliberate: an id in a request body is an id an attacker can change, and
 * "check that the id belongs to you" is a check that will eventually be
 * forgotten on one endpoint out of twelve. Removing the parameter removes the
 * class of bug (specification §22 — IDOR).
 *
 * The same rule governs clinics. `assertPractisesAt` refuses a location the
 * dentist has no CONFIRMED practice at, so a dentist cannot publish prices
 * against a clinic they merely claim to work for.
 *
 * WRITES RECORD THEIR OWN HISTORY
 * Every price change writes a PriceHistory row inside the same transaction as
 * the change. Not afterwards, and not best-effort: a price that changed without
 * a history row is a price nobody can explain later, and on a health platform
 * "why was I quoted this" is a question that gets asked.
 */

import { z } from 'zod';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { validatePriceFields } from './validation';
import { scopeKeyFor, variantKeyFor } from './resolution';
import {
  DESCRIPTION_MAX,
  normalizeDescription,
  validateDescription,
} from './description';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

export const variantPriceInputSchema = z.object({
  /** Null prices the service itself, for a treatment with no variants. */
  variantSlug: z.string().trim().min(1).max(80).nullable().optional(),
  unitKey: z.string().trim().min(2).max(40),
  minMinor: z.bigint().nullable().optional(),
  maxMinor: z.bigint().nullable().optional(),
  actualMinor: z.bigint().nullable().optional(),
  discountedMinor: z.bigint().nullable().optional(),
  packageMinor: z.bigint().nullable().optional(),
  additionalMinor: z.bigint().nullable().optional(),
  currency: z.string().length(3).toUpperCase(),
  isCustomQuote: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  /** The clinic's own wording for this variant. Null clears it. */
  customDescription: z.string().max(DESCRIPTION_MAX).nullable().optional(),
});

export const servicePriceInputSchema = z.object({
  serviceSlug: z.string().trim().min(2).max(80),
  /** Null sets the dentist's global price; an id sets one clinic's. */
  locationId: z.string().trim().min(3).max(60).nullable().optional(),
  isEnabled: z.boolean().optional(),
  isPublicVisible: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  /**
   * The clinic's own wording for this treatment. Null clears it and the master
   * description is shown again — see resolveDescription. This never writes to
   * the catalogue: a dentist editing "their" description must not change what
   * every other clinic shows (specification §9).
   */
  customDescription: z.string().max(DESCRIPTION_MAX).nullable().optional(),
  variants: z.array(variantPriceInputSchema).min(1).max(40),
});

export type VariantPriceInput = z.infer<typeof variantPriceInputSchema>;
export type ServicePriceInput = z.infer<typeof servicePriceInputSchema>;

export interface Actor {
  readonly userId: string;
  readonly requestId?: string;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * The dentist profile behind a session, or a 404.
 *
 * Not found rather than forbidden: a user with no dentist profile is not being
 * denied someone else's resource, they simply have not created theirs.
 */
async function requireOwnProfile(userId: string) {
  const profile = await db().dentistProfile.findUnique({ where: { userId } });
  if (!profile || profile.deletedAt) throw errors.notFound('Dentist profile');
  return profile;
}

/**
 * Refuse a clinic the dentist does not have a confirmed practice at.
 *
 * The confirmation requirement is not bureaucracy: without it any dentist could
 * publish a price list against any clinic in the country, and that clinic's
 * page would show prices it never set.
 */
async function assertPractisesAt(dentistProfileId: string, locationId: string): Promise<void> {
  const practice = await db().dentistPractice.findUnique({
    where: { dentistProfileId_locationId: { dentistProfileId, locationId } },
  });

  if (!practice || !practice.isConfirmed) {
    // Deliberately the same error whether the location does not exist, the
    // dentist has not claimed it, or the claim is unconfirmed. Distinguishing
    // them would turn this endpoint into a way to enumerate clinic ids.
    throw errors.forbidden('tl.dentist.profile.manage.self');
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Everything a price row needs to render, in one query.
 *
 * Not `as const`: Prisma's generated argument types take mutable arrays, and a
 * readonly `orderBy` is rejected outright.
 */
const priceRowInclude = {
  // `service` brings its own description and its variants' descriptions, which
  // are levels 3 and 4 of the fallback chain in description.ts. Without them
  // every row would need a second query to find out what to display.
  service: {
    include: {
      category: true,
      defaultUnit: true,
      variants: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
    },
  },
  location: { select: { id: true, name: true } },
  variantPrices: {
    include: { variant: true, unit: true },
    orderBy: [{ variantKey: 'asc' }],
  },
} satisfies import('@prisma/client').Prisma.DentistServicePriceInclude;

/**
 * A dentist's own list, including rows they have hidden from patients.
 *
 * ONE QUERY, NOT ONE PER ROW.
 * `priceRowInclude` pulls the service, its category, its unit, its variants and
 * the dentist's variant prices in a single round trip. Fetching the service for
 * each row instead is the N+1 that turns a fifty-treatment price list into
 * fifty-one queries, and it only becomes visible once a clinic has a full list
 * (specification §21).
 *
 * Paginated because a multi-site clinic with per-location overrides can hold
 * several hundred rows, and every one of them carries two descriptions.
 */
export async function listOwnPriceList(
  userId: string,
  options: {
    locationId?: string | null;
    limit?: number;
    offset?: number;
  } = {},
) {
  const profile = await requireOwnProfile(userId);

  const where = {
    dentistProfileId: profile.id,
    deletedAt: null,
    ...(options.locationId === undefined ? {} : { locationId: options.locationId }),
  };

  // Clamped rather than trusted: an unbounded `take` from a query string is a
  // cheap way to make the server assemble an arbitrarily large response.
  const take = Math.min(Math.max(options.limit ?? DEFAULT_PRICE_PAGE_SIZE, 1), MAX_PRICE_PAGE_SIZE);
  const skip = Math.max(options.offset ?? 0, 0);

  const [rows, total] = await Promise.all([
    db().dentistServicePrice.findMany({
      where,
      include: priceRowInclude,
      orderBy: [{ service: { categoryId: 'asc' } }, { service: { sortOrder: 'asc' } }],
      take,
      skip,
    }),
    db().dentistServicePrice.count({ where }),
  ]);

  return Object.assign(rows, { total, limit: take, offset: skip });
}

export const DEFAULT_PRICE_PAGE_SIZE = 100;
export const MAX_PRICE_PAGE_SIZE = 500;

/**
 * The public price list for a dentist, as a patient sees it.
 *
 * Three filters, all of which must hold: the dentist is discoverable, the row
 * is enabled, and the row is marked public. A dentist who offers a treatment
 * but has not published its price is not the same as one who does not offer it,
 * and only the second should be absent from the list.
 */
export async function listPublicPriceList(dentistSlug: string, locationId?: string) {
  const profile = await db().dentistProfile.findUnique({ where: { slug: dentistSlug } });

  // An undiscoverable dentist has no public price list, and saying "this
  // dentist exists but is hidden" leaks the existence of unverified profiles.
  if (!profile || !profile.isDiscoverable || profile.deletedAt) return null;

  const rows = await db().dentistServicePrice.findMany({
    where: {
      dentistProfileId: profile.id,
      deletedAt: null,
      isEnabled: true,
      isPublicVisible: true,
      service: { status: 'ACTIVE', deletedAt: null },
      ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}),
    },
    include: priceRowInclude,
    orderBy: [{ service: { categoryId: 'asc' } }, { service: { sortOrder: 'asc' } }],
  });

  return { profile, rows };
}

/** The change history for one of the dentist's own rows. */
export async function listPriceHistory(userId: string, servicePriceId: string) {
  const profile = await requireOwnProfile(userId);

  const row = await db().dentistServicePrice.findUnique({ where: { id: servicePriceId } });
  // Not found rather than forbidden for someone else's row: a 403 would confirm
  // that the id exists, which is the first half of an enumeration attack.
  if (!row || row.dentistProfileId !== profile.id) throw errors.notFound('Price row');

  return db().priceHistory.findMany({
    where: { dentistServicePriceId: servicePriceId },
    orderBy: { changedAt: 'desc' },
    take: 200,
  });
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

const MONEY_FIELDS = [
  'minMinor',
  'maxMinor',
  'actualMinor',
  'discountedMinor',
  'packageMinor',
  'additionalMinor',
] as const;

type MoneyField = (typeof MONEY_FIELDS)[number];

/**
 * Create or replace the price for one service, at one scope.
 *
 * Replaces the variant rows wholesale rather than diffing them. A dentist's
 * edit is a statement about the whole treatment — "these are my crown prices" —
 * and a partial apply would leave a variant they deleted still on their public
 * page.
 */
export async function upsertServicePrice(
  userId: string,
  input: ServicePriceInput,
  actor: Actor,
): Promise<{ servicePriceId: string; changes: number }> {
  const parsed = servicePriceInputSchema.parse(input);
  const profile = await requireOwnProfile(userId);

  const locationId = parsed.locationId ?? null;
  if (locationId) await assertPractisesAt(profile.id, locationId);

  const service = await db().catalogueService.findUnique({
    where: { slug: parsed.serviceSlug },
    include: { variants: true },
  });
  if (!service || service.deletedAt) {
    throw errors.validation('That treatment is not in the catalogue.', { field: 'serviceSlug' });
  }
  if (service.status === 'ARCHIVED') {
    throw errors.validation(
      'That treatment has been archived and cannot be priced. Existing prices for it are unaffected.',
      { field: 'serviceSlug' },
    );
  }

  const units = await db().priceUnit.findMany({ where: { status: 'ACTIVE' } });
  const unitByKey = new Map(units.map((unit) => [unit.key, unit]));
  const variantBySlug = new Map(service.variants.map((variant) => [variant.slug, variant]));

  // Validate everything before writing anything. A half-applied price list is
  // worse than a rejected one: nobody knows which half is live.
  const prepared = parsed.variants.map((variant, index) => {
    const unit = unitByKey.get(variant.unitKey);
    if (!unit) {
      throw errors.validation(`'${variant.unitKey}' is not a pricing unit.`, {
        field: `variants.${index}.unitKey`,
      });
    }

    let variantId: string | null = null;
    if (variant.variantSlug) {
      const match = variantBySlug.get(variant.variantSlug);
      if (!match) {
        throw errors.validation(
          `'${variant.variantSlug}' is not a variant of ${service.name}.`,
          { field: `variants.${index}.variantSlug` },
        );
      }
      variantId = match.id;
    }

    const issues = [...validatePriceFields({
      ...variant,
      unitKey: variant.unitKey,
      currency: variant.currency,
    })];

    const descriptionIssue = validateDescription(
      variant.customDescription,
      'customDescription',
    );
    if (descriptionIssue) issues.push(descriptionIssue);

    if (issues.length > 0) {
      throw errors.validation('One or more prices are not valid.', {
        issues: issues.map((issue) => ({
          field: `variants.${index}.${issue.field}`,
          message: issue.message,
        })),
      });
    }

    return { input: variant, unitId: unit.id, variantId, variantKey: variantKeyFor(variantId) };
  });

  // Two rows for the same variant would violate the unique constraint, but the
  // error a dentist would see is a database message. Catch it here instead.
  const keys = prepared.map((row) => row.variantKey);
  if (new Set(keys).size !== keys.length) {
    throw errors.validation('The same variant is priced twice in this submission.', {
      field: 'variants',
    });
  }

  const scopeKey = scopeKeyFor(locationId);
  let changeCount = 0;

  const servicePriceId = await transaction(async (tx) => {
    const existing = await tx.dentistServicePrice.findUnique({
      where: {
        dentistProfileId_serviceId_scopeKey: {
          dentistProfileId: profile.id,
          serviceId: service.id,
          scopeKey,
        },
      },
      include: { variantPrices: true },
    });

    const rowId = existing?.id ?? newId('dentistServicePrice');

    await tx.dentistServicePrice.upsert({
      where: {
        dentistProfileId_serviceId_scopeKey: {
          dentistProfileId: profile.id,
          serviceId: service.id,
          scopeKey,
        },
      },
      create: {
        id: rowId,
        dentistProfileId: profile.id,
        serviceId: service.id,
        locationId,
        scopeKey,
        isEnabled: parsed.isEnabled ?? true,
        isPublicVisible: parsed.isPublicVisible ?? true,
        note: parsed.note ?? null,
        customDescription: normalizeDescription(parsed.customDescription),
      },
      update: {
        ...(parsed.isEnabled === undefined ? {} : { isEnabled: parsed.isEnabled }),
        ...(parsed.isPublicVisible === undefined
          ? {}
          : { isPublicVisible: parsed.isPublicVisible }),
        note: parsed.note ?? null,
        // Only written when the caller sent the field. Omitting it from a
        // price-only edit must not silently wipe wording the clinic wrote.
        ...(parsed.customDescription === undefined
          ? {}
          : { customDescription: normalizeDescription(parsed.customDescription) }),
        deletedAt: null,
      },
    });

    const previousByKey = new Map(
      (existing?.variantPrices ?? []).map((row) => [row.variantKey, row]),
    );

    for (const row of prepared) {
      const previous = previousByKey.get(row.variantKey);
      const variantPriceId = previous?.id ?? newId('dentistVariantPrice');

      const values = {
        variantId: row.variantId,
        variantKey: row.variantKey,
        unitId: row.unitId,
        minMinor: row.input.minMinor ?? null,
        maxMinor: row.input.maxMinor ?? null,
        actualMinor: row.input.actualMinor ?? null,
        discountedMinor: row.input.discountedMinor ?? null,
        packageMinor: row.input.packageMinor ?? null,
        additionalMinor: row.input.additionalMinor ?? null,
        currency: row.input.currency,
        isCustomQuote: row.input.isCustomQuote ?? false,
        isEnabled: row.input.isEnabled ?? true,
        customDescription: normalizeDescription(row.input.customDescription),
      };

      await tx.dentistVariantPrice.upsert({
        where: {
          dentistServicePriceId_variantKey: {
            dentistServicePriceId: rowId,
            variantKey: row.variantKey,
          },
        },
        create: { id: variantPriceId, dentistServicePriceId: rowId, ...values },
        update: values,
      });

      // One history row per field that actually moved, so "₹11,000 → ₹12,000"
      // is one readable line rather than a diff of the whole record.
      for (const field of MONEY_FIELDS) {
        const before = previous ? previous[field] : null;
        const after = values[field as MoneyField];
        if (before === after) continue;

        await tx.priceHistory.create({
          data: {
            id: newId('priceHistory'),
            dentistServicePriceId: rowId,
            dentistVariantPriceId: variantPriceId,
            changedByUserId: userId,
            field,
            previousMinor: before,
            newMinor: after,
            currency: values.currency,
          },
        });
        changeCount += 1;
      }
    }

    // Variants the dentist removed from the submission. Deleted, because the
    // submission is a statement about the whole treatment.
    const submitted = new Set(prepared.map((row) => row.variantKey));
    const removed = (existing?.variantPrices ?? []).filter(
      (row) => !submitted.has(row.variantKey),
    );

    for (const row of removed) {
      await tx.priceHistory.create({
        data: {
          id: newId('priceHistory'),
          dentistServicePriceId: rowId,
          changedByUserId: userId,
          field: 'removed',
          previousText: row.variantKey,
          newText: null,
        },
      });
      changeCount += 1;
    }

    if (removed.length > 0) {
      await tx.dentistVariantPrice.deleteMany({
        where: { id: { in: removed.map((row) => row.id) } },
      });
    }

    return rowId;
  });

  await recordAuditEvent({
    action: 'pricing.service.upsert',
    actor: actor.userId,
    subject: servicePriceId,
    outcome: 'success',
    requestId: actor.requestId,
    detail: { serviceSlug: parsed.serviceSlug, locationId, changes: changeCount },
  });

  return { servicePriceId, changes: changeCount };
}

/**
 * Enable, disable or hide rows in bulk.
 *
 * Ids are filtered to the dentist's own rows before the update rather than
 * checked one by one afterwards, so an id belonging to someone else is a no-op
 * rather than an error — and the response says how many were actually touched,
 * which is what tells an honest caller they sent something wrong.
 */
export async function bulkSetRowFlags(
  userId: string,
  input: {
    readonly servicePriceIds: readonly string[];
    readonly isEnabled?: boolean;
    readonly isPublicVisible?: boolean;
  },
  actor: Actor,
): Promise<{ updated: number }> {
  const profile = await requireOwnProfile(userId);

  if (input.isEnabled === undefined && input.isPublicVisible === undefined) {
    throw errors.validation('Nothing to change.');
  }

  const result = await db().dentistServicePrice.updateMany({
    where: {
      id: { in: [...input.servicePriceIds] },
      // The ownership filter. Without it this endpoint would edit any row on
      // the platform by id.
      dentistProfileId: profile.id,
      deletedAt: null,
    },
    data: {
      ...(input.isEnabled === undefined ? {} : { isEnabled: input.isEnabled }),
      ...(input.isPublicVisible === undefined
        ? {}
        : { isPublicVisible: input.isPublicVisible }),
    },
  });

  await recordAuditEvent({
    action: 'pricing.bulk.flags',
    actor: actor.userId,
    subject: profile.id,
    outcome: 'success',
    requestId: actor.requestId,
    detail: {
      requested: input.servicePriceIds.length,
      updated: result.count,
      isEnabled: input.isEnabled,
      isPublicVisible: input.isPublicVisible,
    },
  });

  return { updated: result.count };
}

/**
 * Remove a treatment from the dentist's list.
 *
 * Soft delete. The price history references the row, and a patient may have
 * been quoted from it an hour ago — "we never offered that" is not a claim the
 * platform should be able to make on a dentist's behalf.
 */
export async function removeServicePrice(
  userId: string,
  servicePriceId: string,
  actor: Actor,
): Promise<void> {
  const profile = await requireOwnProfile(userId);

  const row = await db().dentistServicePrice.findUnique({ where: { id: servicePriceId } });
  if (!row || row.dentistProfileId !== profile.id || row.deletedAt) {
    throw errors.notFound('Price row');
  }

  await db().dentistServicePrice.update({
    where: { id: servicePriceId },
    data: { deletedAt: new Date(), isEnabled: false, isPublicVisible: false },
  });

  await recordAuditEvent({
    action: 'pricing.service.remove',
    actor: actor.userId,
    subject: servicePriceId,
    outcome: 'success',
    requestId: actor.requestId,
  });
}
