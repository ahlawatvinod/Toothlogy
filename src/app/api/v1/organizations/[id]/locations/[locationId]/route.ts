/**
 * TL-API-ORG-LOCUPDATE-001 — PATCH  /api/v1/organizations/:id/locations/:locationId
 * TL-API-ORG-LOCCLOSE-001  — DELETE /api/v1/organizations/:id/locations/:locationId
 *
 * Edit a branch, or close it permanently. Both are scoped twice: the route
 * checks the caller manages the organization, and the service only finds the
 * location if it belongs to that organization.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { closeLocation, updateLocation, updateLocationSchema } from '@/platform/organizations/location-management';

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

export const PATCH = defineRoute({
  id: 'TL-API-ORG-LOCUPDATE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: updateLocationSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const { organizationId, locationId } = ids(params);
    const location = await updateLocation(organizationId, locationId, body, principal.userId, { requestId });
    return {
      locationId: location.id,
      discoverable: location.latitude !== null && location.longitude !== null && location.status === 'ACTIVE',
    };
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-ORG-LOCCLOSE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const { organizationId, locationId } = ids(params);
    await closeLocation(organizationId, locationId, principal.userId, { requestId });
    return { closed: true };
  },
});
