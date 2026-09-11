/**
 * TL-API-ENTERPRISE-MEMBER-001 — POST /api/v1/admin/enterprise/members
 *   { action: LINK, groupOrganizationId, memberOrganizationId, reason } |
 *   { action: UNLINK, memberOrganizationId, reason }
 *
 * Put an organization into a group or take it out. Groups are one level deep.
 */

import { membershipSchema, setGroupMembership } from '@/platform/enterprise/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ENTERPRISE-MEMBER-001',
  permissions: ['tl.admin.enterprise.manage'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: membershipSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => setGroupMembership(principal, body, { requestId }),
});
