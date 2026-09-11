/**
 * Managing a practice's availability: the dentist's weekly sessions, and the
 * leave and blocked times on top of them.
 *
 * Either the dentist or clinic staff holding `tl.appointment.availability.manage` for the
 * branch's organization may change them; anyone else is told the practice
 * does not exist. Existing appointments are never moved by these changes —
 * a new block over a booked slot is refused, because silently leaving a
 * patient booked into a block is worse than asking the practice to move them
 * first.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db, transaction } from '../db/client';
import { recordAuditEvent } from '../audit';
import { can, isAuthenticated, type Principal } from '../rbac';
import { ACTIVE_STATUSES } from './availability';

async function practiceFor(principal: Principal, practiceId: string) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const practice = await db().dentistPractice.findUnique({
    where: { id: practiceId },
    include: {
      dentistProfile: { select: { userId: true } },
      location: { select: { organizationId: true, timezone: true, name: true, businessHours: true } },
    },
  });
  const allowed =
    practice &&
    (practice.dentistProfile.userId === principal.userId ||
      can(principal, 'tl.appointment.availability.manage', { organizationId: practice.location.organizationId }));
  if (!practice || !allowed) throw errors.notFound('Practice');
  return practice;
}

export const rulesSchema = z.object({
  rules: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startMinutes: z.number().int().min(0).max(1439),
          endMinutes: z.number().int().min(1).max(1440),
          appointmentTypes: z.array(z.enum(['CLINIC', 'VIDEO', 'HOME_VISIT'])).max(3).default([]),
        })
        .refine((r) => r.endMinutes > r.startMinutes, { message: 'A session must end after it starts.', path: ['endMinutes'] }),
    )
    .max(42),
});

/** Replace the dentist's weekly sessions. An empty list means "the branch's hours". */
export async function setAvailabilityRules(principal: Principal, practiceId: string, raw: z.input<typeof rulesSchema>, requestId?: string) {
  const practice = await practiceFor(principal, practiceId);
  const input = rulesSchema.parse(raw);
  for (let day = 0; day <= 6; day += 1) {
    const sessions = input.rules.filter((r) => r.dayOfWeek === day).sort((a, b) => a.startMinutes - b.startMinutes);
    for (let i = 1; i < sessions.length; i += 1) {
      if (sessions[i]!.startMinutes < sessions[i - 1]!.endMinutes) {
        throw errors.validation('Two sessions on the same day overlap.', { field: 'rules', dayOfWeek: day });
      }
    }
  }
  await transaction(async (tx) => {
    await tx.availabilityRule.deleteMany({ where: { practiceId } });
    if (input.rules.length > 0) {
      await tx.availabilityRule.createMany({
        data: input.rules.map((r) => ({ id: newId('availabilityRule'), practiceId, ...r })),
      });
    }
  });
  await recordAuditEvent({
    action: 'AVAILABILITY_RULES_SET',
    actor: isAuthenticated(principal) ? principal.userId : 'system',
    subject: practiceId,
    outcome: 'success',
    organizationId: practice.location.organizationId,
    requestId,
    detail: { sessions: input.rules.length },
  });
  return listAvailability(principal, practiceId);
}

export const exceptionSchema = z
  .object({
    kind: z.enum(['LEAVE', 'BLOCK']),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), { message: 'The end must be after the start.', path: ['endsAt'] });

export async function addAvailabilityException(principal: Principal, practiceId: string, raw: z.input<typeof exceptionSchema>, requestId?: string) {
  const practice = await practiceFor(principal, practiceId);
  const input = exceptionSchema.parse(raw);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt.getTime() < Date.now()) throw errors.validation('That time has already passed.', { field: 'endsAt' });
  if (endsAt.getTime() - startsAt.getTime() > 180 * 86_400_000) throw errors.validation('Leave or a block can be at most 180 days.');

  const clashes = await db().appointment.count({
    where: {
      practiceId,
      status: { in: [...ACTIVE_STATUSES] },
      startsAt: { lt: endsAt },
      occupiedUntil: { gt: startsAt },
    },
  });
  if (clashes > 0) {
    throw errors.conflict(`${clashes} booked appointment${clashes === 1 ? '' : 's'} fall in that time. Move or cancel them first.`, { clashes });
  }
  const created = await db().availabilityException.create({
    data: {
      id: newId('availabilityException'),
      practiceId,
      kind: input.kind,
      startsAt,
      endsAt,
      reason: input.reason ?? null,
      createdByUserId: isAuthenticated(principal) ? principal.userId : 'system',
    },
  });
  await recordAuditEvent({
    action: 'AVAILABILITY_EXCEPTION_ADDED',
    actor: isAuthenticated(principal) ? principal.userId : 'system',
    subject: created.id,
    outcome: 'success',
    organizationId: practice.location.organizationId,
    requestId,
    detail: { kind: input.kind },
  });
  return created;
}

export async function removeAvailabilityException(principal: Principal, practiceId: string, exceptionId: string) {
  await practiceFor(principal, practiceId);
  const result = await db().availabilityException.deleteMany({ where: { id: exceptionId, practiceId } });
  if (result.count === 0) throw errors.notFound('Exception');
}

export async function listAvailability(principal: Principal, practiceId: string) {
  const practice = await practiceFor(principal, practiceId);
  const [rules, exceptions] = await Promise.all([
    db().availabilityRule.findMany({ where: { practiceId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] }),
    db().availabilityException.findMany({ where: { practiceId, endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } }),
  ]);
  return {
    practiceId,
    timezone: practice.location.timezone,
    locationName: practice.location.name,
    clinicHours: practice.location.businessHours.map((h) => ({ dayOfWeek: h.dayOfWeek, startMinutes: h.opensAtMinutes, endMinutes: h.closesAtMinutes })),
    rules: rules.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, startMinutes: r.startMinutes, endMinutes: r.endMinutes, appointmentTypes: r.appointmentTypes })),
    exceptions: exceptions.map((e) => ({ id: e.id, kind: e.kind, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), reason: e.reason })),
  };
}
