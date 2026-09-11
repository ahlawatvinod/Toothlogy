/**
 * TOOTHLOGY SERVICE OFFERINGS — what a clinic does, at what price
 *
 * An offering is a catalogue treatment, at one location, at the clinic's price
 * — optionally at one dentist's own price there. The catalogue owns the name
 * and the patient guidance; the clinic owns price, duration and how it can be
 * booked.
 *
 * RULES ENFORCED HERE, NOT IN THE FORM
 * - The treatment must exist in the catalogue and be active.
 * - A dentist-specific offering needs a CONFIRMED practice at that location.
 * - A price range must be a range (min ≤ max), in the organization's currency.
 * - VIDEO only for treatments that can happen by video: consultations,
 *   second opinions and emergency triage. A filling cannot.
 * - HOME_VISIT only where the location has declared a home-visit radius.
 * - One active offering per (location, treatment, dentist) — the second is a
 *   conflict, not a silent duplicate that shows two prices.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { APPOINTMENT_TYPES } from '../catalogue/facilities';

const VIDEO_CAPABLE_CATEGORIES = new Set(['consultation', 'emergency']);
const MAX_PRICE_MINOR = 100_000_000; // 10 lakh in paise; far beyond any single dental fee

export const offeringInputSchema = z
  .object({
    locationId: z.string().min(1).max(64),
    treatmentKey: z.string().min(1).max(80),
    /** Null: "price on consultation" — a real answer, distinct from zero. */
    priceMinor: z.number().int().min(0).max(MAX_PRICE_MINOR).nullable(),
    priceMaxMinor: z.number().int().min(0).max(MAX_PRICE_MINOR).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    appointmentTypes: z.array(z.enum(APPOINTMENT_TYPES)).min(1).max(3).default(['CLINIC']),
    description: z.string().trim().max(2000).optional(),
    preparation: z.string().trim().max(2000).optional(),
    aftercare: z.string().trim().max(2000).optional(),
    requiresConsultation: z.boolean().default(false),
  })
  .refine((v) => v.priceMaxMinor == null || v.priceMinor == null || v.priceMaxMinor >= v.priceMinor, {
    message: 'The upper price must not be below the starting price.',
    path: ['priceMaxMinor'],
  });

/** What a caller passes: defaults (CLINIC, no consultation) may be omitted. */
export type OfferingInput = z.input<typeof offeringInputSchema>;

export const offeringUpdateSchema = z
  .object({
    priceMinor: z.number().int().min(0).max(MAX_PRICE_MINOR).nullable().optional(),
    priceMaxMinor: z.number().int().min(0).max(MAX_PRICE_MINOR).nullable().optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    appointmentTypes: z.array(z.enum(APPOINTMENT_TYPES)).min(1).max(3).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    preparation: z.string().trim().max(2000).nullable().optional(),
    aftercare: z.string().trim().max(2000).nullable().optional(),
    requiresConsultation: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

function issues(error: z.ZodError) {
  return { issues: error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })) };
}

async function validateTypes(
  types: readonly string[],
  treatmentCategory: string,
  location: { homeVisitRadiusKm: number | null },
): Promise<void> {
  if (types.includes('VIDEO') && !VIDEO_CAPABLE_CATEGORIES.has(treatmentCategory)) {
    throw errors.validation('This treatment cannot be done by video. Offer it in the clinic instead.', {
      field: 'appointmentTypes',
    });
  }
  if (types.includes('HOME_VISIT') && location.homeVisitRadiusKm === null) {
    throw errors.validation('Set a home-visit area for this location before offering home visits.', {
      field: 'appointmentTypes',
    });
  }
}

/**
 * Create an offering at one of an organization's locations. Called by a clinic
 * manager (`tl.clinic.service.manage`) or, for their own price, by a dentist
 * with a confirmed practice there (`dentistProfileId`).
 */
export async function createOffering(
  organizationId: string,
  rawInput: OfferingInput,
  actorUserId: string,
  options: { dentistProfileId?: string; requestId?: string } = {},
): Promise<{ offeringId: string }> {
  const parsed = offeringInputSchema.safeParse(rawInput);
  if (!parsed.success) throw errors.validation('The service details are not valid.', issues(parsed.error));
  const input = parsed.data;

  const location = await db().location.findFirst({
    where: { id: input.locationId, organizationId, deletedAt: null },
    include: { organization: { select: { currency: true } } },
  });
  if (!location) throw errors.notFound('Location');

  const treatment = await db().treatment.findFirst({ where: { key: input.treatmentKey, isActive: true } });
  if (!treatment) throw errors.validation('Choose a treatment from the catalogue.', { field: 'treatmentKey' });

  if (options.dentistProfileId) {
    const practice = await db().dentistPractice.findFirst({
      where: { dentistProfileId: options.dentistProfileId, locationId: location.id, isConfirmed: true },
    });
    if (!practice) {
      throw errors.preconditionFailed('Your practice at this location must be confirmed by the clinic first.');
    }
  }

  await validateTypes(input.appointmentTypes, treatment.category, location);

  const duplicate = await db().serviceOffering.findFirst({
    where: {
      locationId: location.id,
      treatmentId: treatment.id,
      dentistProfileId: options.dentistProfileId ?? null,
      isActive: true,
    },
    select: { id: true },
  });
  if (duplicate) {
    throw errors.conflict('This treatment is already offered here. Edit the existing price instead.', {
      offeringId: duplicate.id,
    });
  }

  const offeringId = newId('service');
  await db().serviceOffering.create({
    data: {
      id: offeringId,
      locationId: location.id,
      treatmentId: treatment.id,
      dentistProfileId: options.dentistProfileId ?? null,
      name: treatment.name,
      description: input.description ?? null,
      priceMinor: input.priceMinor,
      priceMaxMinor: input.priceMaxMinor ?? null,
      // Prices are always in the organization's currency: one clinic, one
      // currency, so a patient never compares rupees with dirhams unknowingly.
      currency: input.priceMinor === null ? null : location.organization.currency,
      durationMinutes: input.durationMinutes ?? treatment.typicalDurationMinutes,
      appointmentTypes: input.appointmentTypes,
      preparation: input.preparation ?? null,
      aftercare: input.aftercare ?? null,
      requiresConsultation: input.requiresConsultation,
      isActive: true,
    },
  });

  await recordAuditEvent({
    action: 'SERVICE_OFFERING_CREATED',
    actor: actorUserId,
    subject: offeringId,
    outcome: 'success',
    organizationId,
    requestId: options.requestId,
    detail: { treatment: treatment.key, dentistSpecific: Boolean(options.dentistProfileId) },
  });

  // Treatments are a search facet for the clinic and its dentists.
  const { reindexOrganizationSafely } = await import('../discovery/indexer');
  await reindexOrganizationSafely(organizationId);

  return { offeringId };
}

export async function updateOffering(
  organizationId: string,
  offeringId: string,
  rawInput: z.infer<typeof offeringUpdateSchema>,
  actorUserId: string,
  options: { dentistProfileId?: string; requestId?: string } = {},
): Promise<void> {
  const parsed = offeringUpdateSchema.safeParse(rawInput);
  if (!parsed.success) throw errors.validation('The service details are not valid.', issues(parsed.error));
  const input = parsed.data;

  // Scoped by organization (and by dentist, for a dentist editing their own
  // price), so an id from elsewhere is simply not found.
  const offering = await db().serviceOffering.findFirst({
    where: {
      id: offeringId,
      location: { organizationId, deletedAt: null },
      ...(options.dentistProfileId ? { dentistProfileId: options.dentistProfileId } : {}),
    },
    include: { treatment: true, location: { include: { organization: { select: { currency: true } } } } },
  });
  if (!offering) throw errors.notFound('Service');

  const nextMin = input.priceMinor !== undefined ? input.priceMinor : offering.priceMinor;
  const nextMax = input.priceMaxMinor !== undefined ? input.priceMaxMinor : offering.priceMaxMinor;
  if (nextMin !== null && nextMax !== null && nextMax < nextMin) {
    throw errors.validation('The upper price must not be below the starting price.', { field: 'priceMaxMinor' });
  }
  if (input.appointmentTypes) {
    await validateTypes(input.appointmentTypes, offering.treatment?.category ?? 'consultation', offering.location);
  }

  await db().serviceOffering.update({
    where: { id: offering.id },
    data: {
      ...input,
      currency: nextMin === null ? null : offering.location.organization.currency,
    },
  });

  await recordAuditEvent({
    action: input.isActive === false ? 'SERVICE_OFFERING_DEACTIVATED' : 'SERVICE_OFFERING_UPDATED',
    actor: actorUserId,
    subject: offering.id,
    outcome: 'success',
    organizationId,
    requestId: options.requestId,
    detail: { fields: Object.keys(input) },
  });

  const { reindexOrganizationSafely } = await import('../discovery/indexer');
  await reindexOrganizationSafely(organizationId);
}

/** Offerings at an organization's locations, for its own management screens. */
export async function listOrganizationOfferings(organizationId: string) {
  return db().serviceOffering.findMany({
    where: { location: { organizationId, deletedAt: null } },
    include: {
      treatment: { select: { key: true, name: true, category: true } },
      location: { select: { id: true, name: true } },
      dentistProfile: { select: { id: true, slug: true, user: { select: { displayName: true } } } },
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

/** Active offerings at one location, for the public clinic page and booking. */
export async function listPublicOfferings(locationId: string) {
  return db().serviceOffering.findMany({
    where: { locationId, isActive: true, location: { deletedAt: null } },
    include: {
      treatment: { select: { key: true, name: true, category: true, description: true } },
      dentistProfile: { select: { slug: true, isDiscoverable: true, user: { select: { displayName: true } } } },
    },
    orderBy: [{ treatment: { sortOrder: 'asc' } }],
  });
}
