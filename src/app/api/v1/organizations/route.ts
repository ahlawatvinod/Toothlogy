/**
 * TL-API-ORG-CREATE-001 — POST /api/v1/organizations
 * TL-API-ORG-LIST-001   — GET  /api/v1/organizations
 *
 * Creating an organization needs no organization-scoped permission — by
 * definition the organization does not exist yet. Any authenticated user may
 * create one, and becomes its administrator. It starts PENDING and is not
 * publicly discoverable until verified (Constitution P2).
 *
 * The list returns only organizations the caller belongs to. There is no
 * "all organizations" listing here: that is an administrative capability and
 * belongs behind an admin permission, not on the endpoint every member calls.
 */

import {
  createOrganization,
  createOrganizationSchema,
  listUserOrganizations,
} from '@/platform/organizations/service';
import { defineRoute } from '@/platform/http/handler';
import { isAuthenticated } from '@/platform/rbac';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ORG-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: createOrganizationSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();

    const result = await createOrganization(body, principal.userId, { requestId });

    return {
      organizationId: result.organizationId,
      status: 'PENDING',
      // Stated plainly so the client does not imply the clinic is live.
      message:
        'Organization created. It is not publicly discoverable until verification is complete.',
    };
  },
});

export const GET = defineRoute({
  id: 'TL-API-ORG-LIST-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return { organizations: await listUserOrganizations(principal.userId) };
  },
});
