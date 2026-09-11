/**
 * Family members an account holder books for. The account holder stays the
 * contact and the one who manages the appointment; the dependent is who is
 * seen. Only the guardian can see or use their dependents.
 */

import { z } from 'zod';
import { errors } from '../kernel/errors';
import { newId } from '../kernel/ids';
import { db } from '../db/client';
import { isAuthenticated, type Principal } from '../rbac';

const MAX_DEPENDENTS = 10;

export const dependentSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name.').max(120),
  relationship: z.enum(['CHILD', 'PARENT', 'SPOUSE', 'SIBLING', 'OTHER']),
  birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()).optional(),
});

export async function listDependents(principal: Principal) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  return db().dependent.findMany({
    where: { guardianUserId: principal.userId, deletedAt: null },
    select: { id: true, name: true, relationship: true, birthYear: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addDependent(principal: Principal, raw: z.input<typeof dependentSchema>) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  const input = dependentSchema.parse(raw);
  const count = await db().dependent.count({ where: { guardianUserId: principal.userId, deletedAt: null } });
  if (count >= MAX_DEPENDENTS) throw errors.preconditionFailed(`You can add up to ${MAX_DEPENDENTS} family members.`);
  return db().dependent.create({
    data: { id: newId('dependent'), guardianUserId: principal.userId, name: input.name, relationship: input.relationship, birthYear: input.birthYear ?? null },
    select: { id: true, name: true, relationship: true, birthYear: true },
  });
}

export async function removeDependent(principal: Principal, dependentId: string) {
  if (!isAuthenticated(principal)) throw errors.unauthenticated();
  // Soft: past appointments still say who was seen.
  const result = await db().dependent.updateMany({ where: { id: dependentId, guardianUserId: principal.userId, deletedAt: null }, data: { deletedAt: new Date() } });
  if (result.count === 0) throw errors.notFound('Family member');
}
