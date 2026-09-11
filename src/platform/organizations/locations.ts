/**
 * TOOTHLOGY LOCATIONS & BUSINESS HOURS
 *
 * A location is a physical branch. Discovery, availability and booking all
 * attach here rather than to the organization, because a branch is what a
 * patient actually travels to.
 *
 * BUSINESS HOURS ARE MINUTES, NOT TIMESTAMPS
 * A clinic opens at 09:00 *local time* every day. That fact has no date, so
 * storing it as a timestamp drags daylight saving into a question that has
 * nothing to do with it — and produces a clinic that appears to open an hour
 * late for half the year.
 *
 * Several rows per weekday express split shifts, which are the norm for Indian
 * clinics: 09:00–13:00 and 17:00–21:00. A single open/close pair per day cannot
 * represent that, and would show the clinic as open through the afternoon
 * break.
 */

import { z } from 'zod';
import { newId } from '../kernel/ids';
import { errors } from '../kernel/errors';
import { db, isUniqueConstraintError, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { slugSchema } from './service';

const MINUTES_IN_DAY = 24 * 60;

export const businessHoursSchema = z
  .object({
    /** 0 = Sunday … 6 = Saturday, matching JavaScript getDay(). */
    dayOfWeek: z.number().int().min(0).max(6),
    opensAtMinutes: z.number().int().min(0).max(MINUTES_IN_DAY - 1),
    closesAtMinutes: z.number().int().min(1).max(MINUTES_IN_DAY),
  })
  .refine((v) => v.closesAtMinutes > v.opensAtMinutes, {
    message: 'Closing time must be after opening time.',
    path: ['closesAtMinutes'],
  });

export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;

export const createLocationSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name for this location.').max(160),
  slug: slugSchema,
  timezone: z.string().min(1),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  isPrimary: z.boolean().default(false),

  address: z
    .object({
      lines: z.array(z.string().trim().min(1)).min(1, 'Enter at least one address line.').max(5),
      locality: z.string().trim().max(120).optional(),
      regionName: z.string().trim().max(120).optional(),
      postalCode: z.string().trim().max(20).optional(),
      countryCode: z.string().length(2).toUpperCase(),
      cityId: z.string().optional(),
    })
    .optional(),

  /**
   * Coordinates. Optional at creation because an address can be geocoded later,
   * but a location without them cannot appear in a radius search — which the
   * API surfaces rather than hiding.
   */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),

  hours: z.array(businessHoursSchema).max(21).optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

/**
 * Create a branch, its address and its opening hours in one transaction.
 *
 * A location whose address write failed would be undiscoverable and would look
 * like a data-entry mistake rather than a bug.
 */
export async function createLocation(
  organizationId: string,
  rawInput: CreateLocationInput,
  actorUserId: string,
  context: { requestId?: string } = {},
): Promise<{ locationId: string; discoverable: boolean }> {
  // Validated here as well as at the API boundary: scripts, jobs and tests call
  // this directly and never pass through the route's schema.
  const parsed = createLocationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('The location details are not valid.', {
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  const input = parsed.data;

  const locationId = newId('location');

  try {
    await transaction(async (tx) => {
      let addressId: string | null = null;

      if (input.address) {
        addressId = newId('address');
        await tx.address.create({
          data: {
            id: addressId,
            lines: input.address.lines,
            locality: input.address.locality ?? null,
            regionName: input.address.regionName ?? null,
            postalCode: input.address.postalCode ?? null,
            countryCode: input.address.countryCode,
            cityId: input.address.cityId ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
          },
        });
      }

      // Only one primary branch per organization. Demoting the others here
      // rather than trusting the caller keeps the invariant true regardless of
      // which client wrote the request.
      if (input.isPrimary) {
        await tx.location.updateMany({
          where: { organizationId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      await tx.location.create({
        data: {
          id: locationId,
          organizationId,
          name: input.name,
          slug: input.slug,
          addressId,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          timezone: input.timezone,
          phone: input.phone ?? null,
          email: input.email ?? null,
          isPrimary: input.isPrimary,
        },
      });

      if (input.hours && input.hours.length > 0) {
        assertNoOverlappingHours(input.hours);
        await tx.businessHours.createMany({
          data: input.hours.map((h) => ({
            id: newId('businessHours'),
            locationId,
            dayOfWeek: h.dayOfWeek,
            opensAtMinutes: h.opensAtMinutes,
            closesAtMinutes: h.closesAtMinutes,
          })),
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw errors.conflict('A location with that URL name already exists here.', {
        field: 'slug',
      });
    }
    throw error;
  }

  await recordAuditEvent({
    action: 'LOCATION_CREATED',
    actor: actorUserId,
    subject: locationId,
    outcome: 'success',
    organizationId,
    requestId: context.requestId,
  });

  return {
    locationId,
    // Reported honestly: without coordinates the branch cannot be returned by a
    // radius search, and the caller should be told rather than discovering it
    // when no patients arrive.
    discoverable: input.latitude !== undefined && input.longitude !== undefined,
  };
}

/**
 * Reject overlapping shifts on the same weekday.
 *
 * Overlapping hours make "is this clinic open?" ambiguous and would later
 * produce duplicate or conflicting appointment slots.
 */
function assertNoOverlappingHours(hours: readonly BusinessHoursInput[]): void {
  const byDay = new Map<number, BusinessHoursInput[]>();
  for (const entry of hours) {
    const list = byDay.get(entry.dayOfWeek) ?? [];
    list.push(entry);
    byDay.set(entry.dayOfWeek, list);
  }

  for (const [day, entries] of byDay) {
    const sorted = [...entries].sort((a, b) => a.opensAtMinutes - b.opensAtMinutes);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.opensAtMinutes < sorted[i - 1]!.closesAtMinutes) {
        throw errors.validation(
          `Opening hours overlap on day ${day}. Split shifts must not overlap.`,
          { field: 'hours' },
        );
      }
    }
  }
}

/** Replace a location's opening hours wholesale. */
export async function setBusinessHours(
  locationId: string,
  hours: readonly BusinessHoursInput[],
  actorUserId: string,
): Promise<void> {
  assertNoOverlappingHours(hours);

  // Delete-then-insert inside a transaction. Diffing would be more code for no
  // benefit: hours are small, and a partial update that left a stale row would
  // show the clinic open when it is closed.
  await transaction(async (tx) => {
    const location = await tx.location.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!location) throw errors.notFound('Location');

    await tx.businessHours.deleteMany({ where: { locationId } });

    if (hours.length > 0) {
      await tx.businessHours.createMany({
        data: hours.map((h) => ({
          id: newId('businessHours'),
          locationId,
          dayOfWeek: h.dayOfWeek,
          opensAtMinutes: h.opensAtMinutes,
          closesAtMinutes: h.closesAtMinutes,
        })),
      });
    }
  });

  await recordAuditEvent({
    action: 'LOCATION_HOURS_UPDATED',
    actor: actorUserId,
    subject: locationId,
    outcome: 'success',
  });
}

/**
 * Is a location open at a given instant?
 *
 * Converts the UTC instant into the LOCATION's local wall clock before
 * comparing against stored minutes. Using the server's clock, or the viewer's,
 * would answer the wrong question — a patient in London checking a clinic in
 * Raipur wants Raipur's opening hours.
 */
export function isOpenAt(
  hours: ReadonlyArray<{ dayOfWeek: number; opensAtMinutes: number; closesAtMinutes: number }>,
  instant: Date,
  timezone: string,
): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');

  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  if (dayIndex === -1) return false;

  const minutesNow = hour * 60 + minute;

  return hours.some(
    (h) =>
      h.dayOfWeek === dayIndex &&
      minutesNow >= h.opensAtMinutes &&
      minutesNow < h.closesAtMinutes,
  );
}

/** Locations for an organization, with hours. */
export async function listLocations(organizationId: string) {
  return db().location.findMany({
    where: { organizationId, deletedAt: null },
    include: { businessHours: { orderBy: [{ dayOfWeek: 'asc' }, { opensAtMinutes: 'asc' }] }, address: true },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
  });
}
