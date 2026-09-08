/**
 * TL-API-AUTH-ME-001 — GET /api/v1/auth/me
 *
 * The signed-in user's own account, profiles, memberships and effective
 * permissions.
 *
 * Returning the resolved permission list is deliberate: it lets a client hide
 * actions the user cannot perform, so they do not click a button that will
 * return 403. It is a UX affordance and NOT a security control — the server
 * checks permissions on every request regardless of what the client believes.
 */

import { db } from '@/platform/db/client';
import { defineRoute } from '@/platform/http/handler';
import { effectivePermissions, isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-AUTH-ME-001',
  permissions: ['tl.core.user.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false, // Read of one's own account, on every page load. Auditing it is noise.
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const user = await db().user.findUnique({
      where: { id: principal.userId },
      include: {
        profiles: { where: { deletedAt: null } },
        organizationMemberships: {
          where: { leftAt: null },
          include: { organization: { select: { id: true, name: true, slug: true, type: true } } },
        },
      },
    });

    if (!user) throw errors.notFound('Account');

    return {
      // Explicitly enumerated rather than spreading the row: a spread would
      // leak any column added later, including a sensitive one.
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      phoneVerified: user.phoneVerifiedAt !== null,
      status: user.status,
      locale: user.locale,
      countryCode: user.countryCode,
      timezone: user.timezone,
      createdAt: user.createdAt,

      roles: principal.roles,
      permissions: [...effectivePermissions(principal)].sort(),

      profiles: user.profiles.map((p) => ({
        id: p.id,
        type: p.type,
        displayName: p.displayName,
        slug: p.slug,
        isPublic: p.isPublic,
      })),

      organizations: user.organizationMemberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        type: m.organization.type,
        roleKey: m.roleKey,
        isPrimary: m.isPrimary,
      })),
    };
  },
});
