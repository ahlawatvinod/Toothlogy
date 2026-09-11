/**
 * TOOTHLOGY PRACTICE SETTINGS — how a dentist takes appointments at a location
 *
 * Settings live on the practice (dentist × location), not the dentist: the
 * same dentist commonly offers instant booking at their own clinic and
 * request-only booking at a hospital, with different fees.
 *
 * Either side may change them. The dentist runs their own diary; the clinic
 * may need to pause bookings for a dentist on leave. Both are audited under
 * the actor's own id, so "who turned off booking?" has an answer.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { db } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';

export const practiceSettingsSchema = z
  .object({
    consultationFeeMinor: z.number().int().min(0).max(10_000_000).nullable().optional(),
    autoConfirm: z.boolean().optional(),
    acceptsVideo: z.boolean().optional(),
    acceptsHomeVisit: z.boolean().optional(),
    acceptsEmergency: z.boolean().optional(),
    slotMinutes: z
      .number()
      .int()
      .min(10)
      .max(240)
      .refine((v) => v % 5 === 0, 'Use a multiple of 5 minutes.')
      .optional(),
    bufferMinutes: z.number().int().min(0).max(60).optional(),
    minNoticeMinutes: z.number().int().min(0).max(7 * 24 * 60).optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    bookingPaused: z.boolean().optional(),
  })
  .strict();

export type PracticeSettingsInput = z.infer<typeof practiceSettingsSchema>;

export async function updatePracticeSettings(
  principal: Principal,
  practiceId: string,
  rawInput: PracticeSettingsInput,
  context: { requestId?: string } = {},
) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const parsed = practiceSettingsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw errors.validation('Those settings are not valid.', {
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  const input = parsed.data;

  const practice = await db().dentistPractice.findUnique({
    where: { id: practiceId },
    include: {
      dentistProfile: { select: { userId: true } },
      location: { select: { organizationId: true, homeVisitRadiusKm: true, deletedAt: true } },
    },
  });
  if (!practice || practice.location.deletedAt) throw errors.notFound('Practice');

  const isDentist = practice.dentistProfile.userId === principal.userId;
  const isClinic = can(principal, 'tl.core.organization.manage', { organizationId: practice.location.organizationId });
  // Not found, not forbidden: whether a practice id exists is not the
  // business of someone who is neither its dentist nor its clinic.
  if (!isDentist && !isClinic) throw errors.notFound('Practice');

  if (input.acceptsHomeVisit && practice.location.homeVisitRadiusKm === null) {
    throw errors.validation('The clinic has not set a home-visit area for this location.', { field: 'acceptsHomeVisit' });
  }

  const updated = await db().dentistPractice.update({ where: { id: practice.id }, data: input });

  await recordAuditEvent({
    action: 'PRACTICE_SETTINGS_UPDATED',
    actor: principal.userId,
    subject: practice.id,
    outcome: 'success',
    organizationId: practice.location.organizationId,
    requestId: context.requestId,
    detail: { fields: Object.keys(input), by: isDentist ? 'dentist' : 'clinic' },
  });

  return updated;
}

/** A dentist's practices with location, organization and settings. */
export async function listMyPractices(userId: string) {
  const profile = await db().dentistProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return [];
  return db().dentistPractice.findMany({
    where: { dentistProfileId: profile.id, location: { deletedAt: null } },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          timezone: true,
          homeVisitRadiusKm: true,
          organization: { select: { id: true, name: true, currency: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}
