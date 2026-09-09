/**
 * TOOTHLOGY MASTER CATALOGUE SERVICE
 *
 * Reading and administering the treatment catalogue.
 *
 * WHO MAY DO WHAT
 * Reading is public: the list of dental treatments that exist is not a secret,
 * and patients browsing "what does a root canal cost in India" is the point.
 * Writing is staff-only, and this module never exposes a write path a dentist
 * could reach. That separation is the whole reason the catalogue and dentist
 * pricing are different tables (specification §10): a dentist who could edit
 * the master range could move the reference point their own price is compared
 * against, which would make the comparison worthless.
 *
 * The permission check itself happens at the route boundary via `defineRoute`,
 * because that is where it cannot be forgotten. These functions take the actor
 * for the audit trail, not to decide access.
 */

import { z } from 'zod';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { normalize } from '../pricing/search';

// ---------------------------------------------------------------------------
// Contracts
// ---------------------------------------------------------------------------

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(slugPattern, 'Use lowercase letters, numbers and single hyphens only.');

export const catalogueStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const categoryInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  patientDescription: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  status: catalogueStatusSchema.optional(),
});

export const serviceInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(160),
  categorySlug: slugSchema,
  unitKey: z.string().trim().min(2).max(40),
  description: z.string().trim().max(4000).optional(),
  patientDescription: z.string().trim().max(1000).optional(),
  suggestedMinMinor: z.bigint().nonnegative().optional(),
  suggestedMaxMinor: z.bigint().nonnegative().optional(),
  suggestedCurrency: z.string().length(3).toUpperCase().optional(),
  suggestedIsOpenEnded: z.boolean().optional(),
  isCustomQuote: z.boolean().optional(),
  isPackage: z.boolean().optional(),
  alsoInCategorySlugs: z.array(slugSchema).max(6).optional(),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  status: catalogueStatusSchema.optional(),
});

export const variantInputSchema = z.object({
  serviceSlug: slugSchema,
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  suggestedMinMinor: z.bigint().nonnegative().optional(),
  suggestedMaxMinor: z.bigint().nonnegative().optional(),
  suggestedCurrency: z.string().length(3).toUpperCase().optional(),
  suggestedIsOpenEnded: z.boolean().optional(),
  isCustomQuote: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  status: catalogueStatusSchema.optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;

/** Statuses a patient-facing surface may show. */
const PUBLIC_STATUSES = ['ACTIVE'] as const;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface CatalogueQuery {
  /** Include DRAFT, INACTIVE and ARCHIVED rows. Administration surfaces only. */
  readonly includeHidden?: boolean;
  readonly categorySlug?: string;
}

/**
 * The whole catalogue, grouped by category.
 *
 * Loaded in one pass rather than a query per category: seventeen categories
 * with sixty treatments is one round trip, and the alternative is the classic
 * N+1 that only becomes visible once the catalogue grows.
 */
export async function listCatalogue(query: CatalogueQuery = {}) {
  const statusFilter = query.includeHidden
    ? {}
    : { status: { in: [...PUBLIC_STATUSES] }, deletedAt: null };

  const categories = await db().serviceCategory.findMany({
    where: {
      ...statusFilter,
      ...(query.categorySlug ? { slug: query.categorySlug } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      services: {
        where: statusFilter,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          defaultUnit: true,
          variants: {
            where: statusFilter,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
          synonyms: true,
        },
      },
    },
  });

  return categories;
}

/**
 * Services that appear in a category, including those whose primary category is
 * elsewhere.
 *
 * This is what makes one canonical "Emergency Consultation" show up under both
 * Consultation & Diagnosis and Emergency Dentistry without a duplicate record
 * (specification §25).
 */
export async function listServicesInCategory(categorySlug: string, includeHidden = false) {
  const statusFilter = includeHidden
    ? {}
    : { status: { in: [...PUBLIC_STATUSES] }, deletedAt: null };

  const category = await db().serviceCategory.findUnique({ where: { slug: categorySlug } });
  if (!category) throw errors.notFound('Category');

  return db().catalogueService.findMany({
    where: {
      ...statusFilter,
      OR: [{ categoryId: category.id }, { categoryLinks: { some: { categoryId: category.id } } }],
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { defaultUnit: true, variants: { where: statusFilter }, synonyms: true },
  });
}

export async function getServiceBySlug(slug: string, includeHidden = false) {
  const service = await db().catalogueService.findUnique({
    where: { slug },
    include: {
      category: true,
      defaultUnit: true,
      variants: {
        where: includeHidden ? {} : { status: 'ACTIVE', deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
      synonyms: true,
      categoryLinks: { include: { category: true } },
    },
  });

  if (!service) return null;
  // A non-public service is "not found" rather than "forbidden" to a public
  // caller: revealing that a draft treatment exists tells them something about
  // unreleased work for no benefit.
  if (!includeHidden && (service.status !== 'ACTIVE' || service.deletedAt)) return null;

  return service;
}

/** The unit list, for pickers. */
export async function listPriceUnits() {
  return db().priceUnit.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export async function upsertCategory(
  input: CategoryInput,
  actor: { userId: string; requestId?: string },
) {
  const parsed = categoryInputSchema.parse(input);

  const category = await db().serviceCategory.upsert({
    where: { slug: parsed.slug },
    create: {
      id: newId('serviceCategory'),
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      patientDescription: parsed.patientDescription ?? null,
      sortOrder: parsed.sortOrder ?? 0,
      status: parsed.status ?? 'ACTIVE',
    },
    update: {
      name: parsed.name,
      description: parsed.description ?? null,
      patientDescription: parsed.patientDescription ?? null,
      ...(parsed.sortOrder === undefined ? {} : { sortOrder: parsed.sortOrder }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
    },
  });

  await recordAuditEvent({
    action: 'catalogue.category.upsert',
    actor: actor.userId,
    subject: category.id,
    outcome: 'success',
    requestId: actor.requestId,
    detail: { slug: category.slug },
  });

  return category;
}

export async function upsertService(
  input: ServiceInput,
  actor: { userId: string; requestId?: string },
) {
  const parsed = serviceInputSchema.parse(input);

  if (
    parsed.suggestedMinMinor !== undefined &&
    parsed.suggestedMaxMinor !== undefined &&
    parsed.suggestedMaxMinor < parsed.suggestedMinMinor
  ) {
    throw errors.validation('The suggested maximum cannot be below the suggested minimum.', {
      field: 'suggestedMaxMinor',
    });
  }

  if (parsed.suggestedMinMinor !== undefined && !parsed.suggestedCurrency) {
    throw errors.validation('A suggested price needs a currency.', { field: 'suggestedCurrency' });
  }

  const category = await db().serviceCategory.findUnique({ where: { slug: parsed.categorySlug } });
  if (!category) throw errors.validation('That category does not exist.', { field: 'categorySlug' });

  const unit = await db().priceUnit.findUnique({ where: { key: parsed.unitKey } });
  if (!unit) throw errors.validation('That pricing unit does not exist.', { field: 'unitKey' });

  const money = {
    suggestedMinMinor: parsed.suggestedMinMinor ?? null,
    suggestedMaxMinor: parsed.suggestedMaxMinor ?? null,
    suggestedCurrency: parsed.suggestedCurrency ?? null,
    suggestedIsOpenEnded: parsed.suggestedIsOpenEnded ?? false,
    isCustomQuote: parsed.isCustomQuote ?? false,
    isPackage: parsed.isPackage ?? false,
  };

  const service = await db().catalogueService.upsert({
    where: { slug: parsed.slug },
    create: {
      id: newId('catalogueService'),
      slug: parsed.slug,
      name: parsed.name,
      categoryId: category.id,
      defaultUnitId: unit.id,
      description: parsed.description ?? null,
      patientDescription: parsed.patientDescription ?? null,
      sortOrder: parsed.sortOrder ?? 0,
      status: parsed.status ?? 'ACTIVE',
      ...money,
    },
    update: {
      name: parsed.name,
      categoryId: category.id,
      defaultUnitId: unit.id,
      description: parsed.description ?? null,
      patientDescription: parsed.patientDescription ?? null,
      ...(parsed.sortOrder === undefined ? {} : { sortOrder: parsed.sortOrder }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
      ...money,
    },
  });

  if (parsed.synonyms) await replaceSynonyms(service.id, parsed.synonyms);
  if (parsed.alsoInCategorySlugs) {
    await replaceCategoryLinks(service.id, category.id, parsed.alsoInCategorySlugs);
  }

  await recordAuditEvent({
    action: 'catalogue.service.upsert',
    actor: actor.userId,
    subject: service.id,
    outcome: 'success',
    requestId: actor.requestId,
    detail: { slug: service.slug, categorySlug: parsed.categorySlug },
  });

  return service;
}

export async function upsertVariant(
  input: VariantInput,
  actor: { userId: string; requestId?: string },
) {
  const parsed = variantInputSchema.parse(input);

  if (
    parsed.suggestedMinMinor !== undefined &&
    parsed.suggestedMaxMinor !== undefined &&
    parsed.suggestedMaxMinor < parsed.suggestedMinMinor
  ) {
    throw errors.validation('The suggested maximum cannot be below the suggested minimum.', {
      field: 'suggestedMaxMinor',
    });
  }

  const service = await db().catalogueService.findUnique({ where: { slug: parsed.serviceSlug } });
  if (!service) throw errors.validation('That service does not exist.', { field: 'serviceSlug' });

  const values = {
    name: parsed.name,
    description: parsed.description ?? null,
    suggestedMinMinor: parsed.suggestedMinMinor ?? null,
    suggestedMaxMinor: parsed.suggestedMaxMinor ?? null,
    suggestedCurrency: parsed.suggestedCurrency ?? null,
    suggestedIsOpenEnded: parsed.suggestedIsOpenEnded ?? false,
    isCustomQuote: parsed.isCustomQuote ?? false,
  };

  const variant = await db().serviceVariant.upsert({
    where: { serviceId_slug: { serviceId: service.id, slug: parsed.slug } },
    create: {
      id: newId('serviceVariant'),
      serviceId: service.id,
      slug: parsed.slug,
      sortOrder: parsed.sortOrder ?? 0,
      status: parsed.status ?? 'ACTIVE',
      ...values,
    },
    update: {
      ...(parsed.sortOrder === undefined ? {} : { sortOrder: parsed.sortOrder }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
      ...values,
    },
  });

  await recordAuditEvent({
    action: 'catalogue.variant.upsert',
    actor: actor.userId,
    subject: variant.id,
    outcome: 'success',
    requestId: actor.requestId,
    detail: { serviceSlug: parsed.serviceSlug, slug: parsed.slug },
  });

  return variant;
}

/**
 * Archive rather than delete.
 *
 * A master service that dentists have priced against cannot be removed: the
 * price rows reference it, and cascading them away would silently delete a
 * clinic's pricing. Archiving hides it from every patient-facing surface and
 * leaves the history intact (specification §19).
 */
export async function archiveService(slug: string, actor: { userId: string; requestId?: string }) {
  const service = await db().catalogueService.findUnique({
    where: { slug },
    include: { _count: { select: { dentistPrices: true } } },
  });
  if (!service) throw errors.notFound('Service');

  const updated = await db().catalogueService.update({
    where: { id: service.id },
    data: { status: 'ARCHIVED', deletedAt: new Date() },
  });

  await recordAuditEvent({
    action: 'catalogue.service.archive',
    actor: actor.userId,
    subject: service.id,
    outcome: 'success',
    requestId: actor.requestId,
    detail: { slug, dentistPriceRows: service._count.dentistPrices },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Replace a service's synonyms wholesale.
 *
 * Delete-then-insert rather than a diff: the list is small, the operation is
 * idempotent, and a diff would need to reason about a keyword whose normalised
 * form is unchanged but whose display spelling was corrected.
 */
async function replaceSynonyms(serviceId: string, keywords: readonly string[]): Promise<void> {
  const rows = keywords
    .map((keyword) => ({ keyword, normalized: normalize(keyword) }))
    .filter((row) => row.normalized.length > 0);

  // Two spellings that normalise the same way — "X-Ray" and "x ray" — would
  // violate the unique constraint. The first spelling wins.
  const unique = new Map(rows.map((row) => [row.normalized, row]));

  await db().serviceSynonym.deleteMany({ where: { serviceId } });
  if (unique.size === 0) return;

  await db().serviceSynonym.createMany({
    data: [...unique.values()].map((row) => ({
      id: newId('serviceSynonym'),
      serviceId,
      keyword: row.keyword,
      normalized: row.normalized,
    })),
  });
}

async function replaceCategoryLinks(
  serviceId: string,
  primaryCategoryId: string,
  categorySlugs: readonly string[],
): Promise<void> {
  const categories = await db().serviceCategory.findMany({
    where: { slug: { in: [...categorySlugs] } },
  });

  if (categories.length !== new Set(categorySlugs).size) {
    throw errors.validation('One or more of those categories do not exist.', {
      field: 'alsoInCategorySlugs',
    });
  }

  await db().serviceCategoryLink.deleteMany({ where: { serviceId } });

  // Linking a service to its own primary category would list it twice in that
  // category. Filtered here rather than rejected, because it is a harmless
  // thing for a caller to send.
  const additional = categories.filter((category) => category.id !== primaryCategoryId);
  if (additional.length === 0) return;

  await db().serviceCategoryLink.createMany({
    data: additional.map((category) => ({
      id: newId('serviceCategoryLink'),
      serviceId,
      categoryId: category.id,
    })),
  });
}
