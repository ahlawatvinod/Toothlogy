/**
 * TL-API-ORG-GET-001 — GET /api/v1/organizations/:id
 *
 * The scoped-authorization example worth reading.
 *
 * `resolveScope` pulls the organization id out of the route params, so
 * `tl.core.organization.read` is evaluated as "may this principal read THIS
 * organization?". Checked globally it would always deny, because nobody holds
 * organization permissions globally — and worse, a naive fix (dropping the
 * permission and checking membership inside the handler) would put the check
 * after the handler had already started reading data.
 *
 * This is the mechanism that stops one clinic's administrator from reading
 * another clinic's records: the most likely serious authorization bug in a
 * multi-tenant product.
 */

import { getOrganization } from '@/platform/organizations/service';
import { updateOrganizationProfile, updateOrganizationSchema } from '@/platform/organizations/management';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

/**
 * TL-API-ORG-UPDATE-001 — PATCH /api/v1/organizations/:id
 *
 * Profile edits by an administrator. Editing the registration number or tax
 * identifier of a verified organization drops its verification.
 */
export const PATCH = defineRoute({
  id: 'TL-API-ORG-UPDATE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: updateOrganizationSchema,
  resolveScope: ({ params }) => ({
    organizationId: typeof params.id === 'string' ? params.id : undefined,
  }),
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (!isAuthenticated(principal) || typeof params.id !== 'string') throw errors.unauthenticated();
    const result = await updateOrganizationProfile(params.id, body, principal.userId, { requestId });
    return {
      id: result.organization.id,
      status: result.organization.status,
      verificationCleared: result.verificationCleared,
      ...(result.verificationCleared
        ? { warning: 'Registration details changed, so the organization must be verified again.' }
        : {}),
    };
  },
});

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ORG-GET-001',
  permissions: ['tl.core.organization.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: ({ params }) => ({
    organizationId: typeof params.id === 'string' ? params.id : undefined,
  }),
  audit: false,
  handler: async ({ params }) => {
    const id = typeof params.id === 'string' ? params.id : null;
    if (!id) throw errors.validation('Organization id is required.');

    const organization = await getOrganization(id);

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      type: organization.type,
      status: organization.status,
      countryCode: organization.countryCode,
      timezone: organization.timezone,
      currency: organization.currency,
      verifiedAt: organization.verifiedAt,
      createdAt: organization.createdAt,

      members: organization.members.map((m) => ({
        userId: m.user.id,
        displayName: m.user.displayName,
        // Member emails are visible to other members of the same organization,
        // which is what makes a staff list usable. They are not public.
        email: m.user.email,
        roleKey: m.roleKey,
        title: m.title,
        isPrimary: m.isPrimary,
        joinedAt: m.joinedAt,
      })),

      locations: organization.locations.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        timezone: l.timezone,
        isPrimary: l.isPrimary,
        status: l.status,
        // Whether this branch can appear in a radius search. Surfaced so an
        // operator can see why their clinic is not being found.
        discoverable: l.latitude !== null && l.longitude !== null,
      })),
    };
  },
});
