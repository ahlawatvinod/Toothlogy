/**
 * TOOTHLOGY LOCATION MANAGEMENT
 *
 * Editing a branch after it is created: contact details, address and map
 * position, facilities, photos, capacity, accessibility, home-visit area,
 * opening hours and closures.
 *
 * Every function takes the ORGANIZATION as well as the location and scopes its
 * query by both, so a location id from another clinic is not found — the same
 * tenant boundary the RBAC layer draws at the route, drawn again at the data.
 *
 * Changing a branch's map position or closing it changes which dentists can be
 * found there, so discoverability is recomputed for everyone practising at it.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { recomputeDiscoverability } from '../dentists/service';
import { FACILITY_BY_KEY } from '../catalogue/facilities';
import { businessHoursSchema, setBusinessHours } from './locations';

export const updateLocationSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210.').nullable().optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    timezone: z.string().min(1).optional(),
    address: z
      .object({
        lines: z.array(z.string().trim().min(1)).min(1).max(5),
        locality: z.string().trim().max(120).optional(),
        regionName: z.string().trim().max(120).optional(),
        postalCode: z.string().trim().max(20).optional(),
        countryCode: z.string().length(2).toUpperCase(),
        cityId: z.string().optional(),
      })
      .optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    facilities: z
      .array(z.string())
      .max(40)
      .refine((keys) => keys.every((k) => FACILITY_BY_KEY.has(k)), 'Choose facilities from the list.')
      .optional(),
    photoFileIds: z.array(z.string().max(64)).max(12).optional(),
    chairs: z.number().int().min(1).max(50).optional(),
    emergencyAvailable: z.boolean().optional(),
    wheelchairAccessible: z.boolean().optional(),
    parkingAvailable: z.boolean().optional(),
    homeVisitRadiusKm: z.number().int().min(1).max(50).nullable().optional(),
    status: z.enum(['ACTIVE', 'TEMPORARILY_CLOSED']).optional(),
  })
  .strict()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'Provide both latitude and longitude.',
    path: ['latitude'],
  });

async function scopedLocation(organizationId: string, locationId: string) {
  const location = await db().location.findFirst({
    where: { id: locationId, organizationId, deletedAt: null },
    include: { dentistPractices: { select: { dentistProfileId: true } } },
  });
  if (!location) throw errors.notFound('Location');
  return location;
}

async function recomputeForLocation(practices: ReadonlyArray<{ dentistProfileId: string }>): Promise<void> {
  for (const p of practices) await recomputeDiscoverability(p.dentistProfileId);
}

export async function updateLocation(
  organizationId: string,
  locationId: string,
  rawInput: z.infer<typeof updateLocationSchema>,
  actorUserId: string,
  context: { requestId?: string } = {},
) {
  const parsed = updateLocationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The location details are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message })),
    });
  }
  const input = parsed.data;
  const location = await scopedLocation(organizationId, locationId);

  if (input.photoFileIds && input.photoFileIds.length > 0) {
    const photos = await db().fileObject.count({
      where: { id: { in: input.photoFileIds }, ownerOrganizationId: organizationId, purpose: 'CLINIC_PHOTO', status: 'ACTIVE' },
    });
    if (photos !== input.photoFileIds.length) {
      throw errors.validation('Upload clinic photos for this organization first.', { field: 'photoFileIds' });
    }
  }

  const { address, ...fields } = input;

  await transaction(async (tx) => {
    let addressId = location.addressId;
    if (address) {
      if (addressId) {
        await tx.address.update({
          where: { id: addressId },
          data: {
            lines: address.lines,
            locality: address.locality ?? null,
            regionName: address.regionName ?? null,
            postalCode: address.postalCode ?? null,
            countryCode: address.countryCode,
            cityId: address.cityId ?? null,
            latitude: input.latitude ?? undefined,
            longitude: input.longitude ?? undefined,
          },
        });
      } else {
        addressId = newId('address');
        await tx.address.create({
          data: {
            id: addressId,
            lines: address.lines,
            locality: address.locality ?? null,
            regionName: address.regionName ?? null,
            postalCode: address.postalCode ?? null,
            countryCode: address.countryCode,
            cityId: address.cityId ?? null,
            latitude: input.latitude ?? location.latitude,
            longitude: input.longitude ?? location.longitude,
          },
        });
      }
    }

    await tx.location.update({
      where: { id: location.id },
      data: { ...fields, addressId },
    });
  });

  const positionChanged = input.latitude !== undefined || input.status !== undefined;
  if (positionChanged) await recomputeForLocation(location.dentistPractices);

  await recordAuditEvent({
    action: 'LOCATION_UPDATED',
    actor: actorUserId,
    subject: location.id,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
    detail: { fields: Object.keys(input) },
  });

  // Address, facilities and access are searchable; the clinic and everyone
  // practising here are re-indexed. Lazy import: see recomputeDiscoverability.
  const { reindexOrganizationSafely } = await import('../discovery/indexer');
  await reindexOrganizationSafely(organizationId);

  return db().location.findUniqueOrThrow({ where: { id: location.id }, include: { address: true } });
}

/** Replace a location's weekly hours, after checking it belongs to the organization. */
export async function setLocationHours(
  organizationId: string,
  locationId: string,
  hours: unknown,
  actorUserId: string,
): Promise<void> {
  const parsed = z.array(businessHoursSchema).max(21).safeParse(hours);
  if (!parsed.success) {
    throw errors.validation('Those opening hours are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  await scopedLocation(organizationId, locationId);
  await setBusinessHours(locationId, parsed.data, actorUserId);
}

/**
 * Close a location permanently. Soft-deleted: past appointments and records
 * still reference it. Its dentists leave search for this location at once.
 */
export async function closeLocation(
  organizationId: string,
  locationId: string,
  actorUserId: string,
  context: { requestId?: string } = {},
): Promise<void> {
  const location = await scopedLocation(organizationId, locationId);
  await db().location.update({
    where: { id: location.id },
    data: { status: 'PERMANENTLY_CLOSED', deletedAt: new Date(), isPrimary: false },
  });
  await recomputeForLocation(location.dentistPractices);
  await recordAuditEvent({
    action: 'LOCATION_CLOSED',
    actor: actorUserId,
    subject: location.id,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
  });

  const { reindexOrganizationSafely } = await import('../discovery/indexer');
  await reindexOrganizationSafely(organizationId);
}

// ---------------------------------------------------------------------------
// Closures
// ---------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-02.');

export const closureSchema = z
  .object({
    startsOn: isoDate,
    endsOn: isoDate,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: 'The last day must not be before the first.', path: ['endsOn'] });

/** Today's date in a timezone, as YYYY-MM-DD. */
export function localDate(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export async function addClosure(
  organizationId: string,
  locationId: string,
  rawInput: z.infer<typeof closureSchema>,
  actorUserId: string,
): Promise<{ closureId: string }> {
  const parsed = closureSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('Those dates are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const input = parsed.data;
  const location = await scopedLocation(organizationId, locationId);

  // Compared on the clinic's own calendar: "today" in Raipur, not on the server.
  if (input.endsOn < localDate(location.timezone)) {
    throw errors.validation('A closure cannot be entirely in the past.', { field: 'endsOn' });
  }
  const spanDays =
    (Date.parse(`${input.endsOn}T00:00:00Z`) - Date.parse(`${input.startsOn}T00:00:00Z`)) / 86_400_000 + 1;
  if (spanDays > 180) throw errors.validation('A closure can be at most 180 days. Close the location instead.');

  const closureId = newId('closure');
  await db().locationClosure.create({
    data: {
      id: closureId,
      locationId: location.id,
      startsOn: new Date(`${input.startsOn}T00:00:00Z`),
      endsOn: new Date(`${input.endsOn}T00:00:00Z`),
      reason: input.reason ?? null,
      createdByUserId: actorUserId,
    },
  });

  await recordAuditEvent({
    action: 'LOCATION_CLOSURE_ADDED',
    actor: actorUserId,
    subject: closureId,
    outcome: 'success',
    organizationId,
    detail: { locationId, startsOn: input.startsOn, endsOn: input.endsOn },
  });
  return { closureId };
}

export async function listClosures(locationId: string, fromDate?: string) {
  const rows = await db().locationClosure.findMany({
    where: { locationId, ...(fromDate ? { endsOn: { gte: new Date(`${fromDate}T00:00:00Z`) } } : {}) },
    orderBy: { startsOn: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    startsOn: r.startsOn.toISOString().slice(0, 10),
    endsOn: r.endsOn.toISOString().slice(0, 10),
    reason: r.reason,
  }));
}

export async function removeClosure(organizationId: string, closureId: string, actorUserId: string): Promise<void> {
  const result = await db().locationClosure.deleteMany({
    where: { id: closureId, location: { organizationId } },
  });
  if (result.count === 0) throw errors.notFound('Closure');
  await recordAuditEvent({
    action: 'LOCATION_CLOSURE_REMOVED',
    actor: actorUserId,
    subject: closureId,
    outcome: 'success',
    organizationId,
  });
}
