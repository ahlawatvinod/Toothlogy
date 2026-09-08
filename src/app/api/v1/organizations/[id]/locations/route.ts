/**
 * TL-API-ORG-LOCCREATE-001 — POST /api/v1/organizations/:id/locations
 * TL-API-ORG-LOCLIST-001   — GET  /api/v1/organizations/:id/locations
 *
 * Branches. Discovery, availability and booking attach here rather than to the
 * organization, because a branch is what a patient travels to.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { createLocation, createLocationSchema, listLocations } from '@/platform/organizations/locations';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const POST = defineRoute({
  id: 'TL-API-ORG-LOCCREATE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: createLocationSchema,
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');

    const result = await createLocation(organizationId, body, principal.userId, { requestId });

    return {
      locationId: result.locationId,
      /**
       * Honest: a branch with no coordinates cannot appear in a radius search.
       * Surfacing it here is how an operator learns why their clinic is not
       * being found, instead of concluding the platform has no patients.
       */
      discoverable: result.discoverable,
      ...(result.discoverable
        ? {}
        : {
            warning:
              'This location has no coordinates, so it will not appear in distance-based search. Add a latitude and longitude to make it discoverable.',
          }),
    };
  },
});

export const GET = defineRoute({
  id: 'TL-API-ORG-LOCLIST-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: false,
  handler: async ({ params }) => {
    const organizationId = typeof params.id === 'string' ? params.id : null;
    if (!organizationId) throw errors.validation('Organization id is required.');

    const locations = await listLocations(organizationId);

    return {
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        timezone: l.timezone,
        phone: l.phone,
        email: l.email,
        isPrimary: l.isPrimary,
        status: l.status,
        discoverable: l.latitude !== null && l.longitude !== null,
        address: l.address
          ? {
              lines: l.address.lines,
              locality: l.address.locality,
              regionName: l.address.regionName,
              postalCode: l.address.postalCode,
              countryCode: l.address.countryCode,
            }
          : null,
        hours: l.businessHours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          opensAtMinutes: h.opensAtMinutes,
          closesAtMinutes: h.closesAtMinutes,
        })),
      })),
    };
  },
});
