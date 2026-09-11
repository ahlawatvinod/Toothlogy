/**
 * TL-API-DEPENDENTS-LIST-001   — GET    /api/v1/me/dependents
 * TL-API-DEPENDENTS-ADD-001    — POST   /api/v1/me/dependents
 * TL-API-DEPENDENTS-REMOVE-001 — DELETE /api/v1/me/dependents?id=
 *
 * Family members you book for. Visible to you alone.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { addDependent, dependentSchema, listDependents, removeDependent } from '@/platform/appointments/dependents';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-DEPENDENTS-LIST-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ dependents: await listDependents(principal) }),
});

export const POST = defineRoute({
  id: 'TL-API-DEPENDENTS-ADD-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: dependentSchema,
  audit: true,
  handler: async ({ principal, body }) => ({ dependent: await addDependent(principal, body) }),
});

export const DELETE = defineRoute({
  id: 'TL-API-DEPENDENTS-REMOVE-001',
  permissions: ['tl.appointment.book.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, url }) => {
    const id = url.searchParams.get('id');
    if (!id) throw errors.validation('Say which family member to remove.', { field: 'id' });
    await removeDependent(principal, id);
    return { removed: true };
  },
});
