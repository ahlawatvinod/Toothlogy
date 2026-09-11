/**
 * TL-API-ME-LOCATIONS-GET-001 — GET    /api/v1/me/locations
 * TL-API-ME-LOCATIONS-ADD-001 — POST   /api/v1/me/locations
 * TL-API-ME-LOCATIONS-DEL-001 — DELETE /api/v1/me/locations?id=…
 *
 * Places a user searches from — home, work, a parent's address — so they can
 * find dentists near a place without sharing live GPS.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import {
  addSavedLocation,
  listSavedLocations,
  removeSavedLocation,
  savedLocationSchema,
} from '@/platform/users/preferences';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ME-LOCATIONS-GET-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return { locations: await listSavedLocations(principal.userId) };
  },
});

export const POST = defineRoute({
  id: 'TL-API-ME-LOCATIONS-ADD-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: savedLocationSchema,
  audit: true,
  handler: async ({ principal, body }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return addSavedLocation(principal.userId, body);
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-ME-LOCATIONS-DEL-001',
  permissions: ['tl.core.user.update.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, url }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const id = url.searchParams.get('id');
    if (!id) throw errors.validation('Say which saved place to remove.', { field: 'id' });
    await removeSavedLocation(principal.userId, id);
    return { removed: true };
  },
});
