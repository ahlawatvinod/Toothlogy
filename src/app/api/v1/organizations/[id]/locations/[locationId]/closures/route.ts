/**
 * TL-API-ORG-CLOSURE-LIST-001   — GET    /api/v1/organizations/:id/locations/:locationId/closures
 * TL-API-ORG-CLOSURE-ADD-001    — POST   /api/v1/organizations/:id/locations/:locationId/closures
 * TL-API-ORG-CLOSURE-REMOVE-001 — DELETE /api/v1/organizations/:id/locations/:locationId/closures?closureId=…
 *
 * Holidays and one-off closures. Availability subtracts these days, so a
 * patient is never offered a slot on a day the clinic has said it is shut.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { db } from '@/platform/db/client';
import {
  addClosure,
  closureSchema,
  listClosures,
  localDate,
  removeClosure,
} from '@/platform/organizations/location-management';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

function ids(params: Record<string, string | string[] | undefined>) {
  if (typeof params.id !== 'string' || typeof params.locationId !== 'string') {
    throw errors.validation('Organization and location ids are required.');
  }
  return { organizationId: params.id, locationId: params.locationId };
}

export const GET = defineRoute({
  id: 'TL-API-ORG-CLOSURE-LIST-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    const { organizationId, locationId } = ids(params);
    const location = await db().location.findFirst({
      where: { id: locationId, organizationId, deletedAt: null },
      select: { timezone: true },
    });
    if (!location) throw errors.notFound('Location');
    return { closures: await listClosures(locationId, localDate(location.timezone)) };
  },
});

export const POST = defineRoute({
  id: 'TL-API-ORG-CLOSURE-ADD-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: closureSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const { organizationId, locationId } = ids(params);
    return addClosure(organizationId, locationId, body, principal.userId);
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-ORG-CLOSURE-REMOVE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, url }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const { organizationId } = ids(params);
    const closureId = url.searchParams.get('closureId');
    if (!closureId) throw errors.validation('Say which closure to remove.', { field: 'closureId' });
    await removeClosure(organizationId, closureId, principal.userId);
    return { removed: true };
  },
});
