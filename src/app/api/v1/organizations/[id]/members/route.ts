/**
 * TL-API-ORG-MEMBER-ROLE-001   — PATCH  /api/v1/organizations/:id/members  { userId, roleKey }
 * TL-API-ORG-MEMBER-REMOVE-001 — DELETE /api/v1/organizations/:id/members?userId=…
 *
 * Change a member's role or remove them. The last administrator cannot be
 * demoted or removed, and neither can the owner — ownership moves only by
 * the owner's own transfer.
 */

import { z } from 'zod';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';
import { ORGANIZATION_ROLES } from '@/platform/organizations/service';
import { removeOrganizationMember, setMemberRole } from '@/platform/organizations/management';

export const dynamic = 'force-dynamic';

const scope = ({ params }: { params: Record<string, string | string[] | undefined> }) => ({
  organizationId: typeof params.id === 'string' ? params.id : undefined,
});

export const PATCH = defineRoute({
  id: 'TL-API-ORG-MEMBER-ROLE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: z.object({ userId: z.string().min(1).max(64), roleKey: z.enum(ORGANIZATION_ROLES) }),
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, body }) => {
    if (!isAuthenticated(principal) || typeof params.id !== 'string') throw errors.unauthenticated();
    await setMemberRole(params.id, body.userId, body.roleKey, principal.userId);
    return { updated: true };
  },
});

export const DELETE = defineRoute({
  id: 'TL-API-ORG-MEMBER-REMOVE-001',
  permissions: ['tl.core.organization.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  resolveScope: scope,
  audit: true,
  handler: async ({ principal, params, url }) => {
    if (!isAuthenticated(principal) || typeof params.id !== 'string') throw errors.unauthenticated();
    const userId = url.searchParams.get('userId');
    if (!userId) throw errors.validation('Say which member to remove.', { field: 'userId' });
    await removeOrganizationMember(params.id, userId, principal.userId);
    return { removed: true };
  },
});
