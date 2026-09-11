/**
 * TL-API-ENTERPRISE-GROUP-001 — GET /api/v1/organizations/:id/enterprise
 *
 * The group's enterprise agreement, its member organizations, service-level
 * results, and data-residency and sign-on status. Checks
 * tl.enterprise.agreement.read on the organization; anyone else is told it
 * does not exist.
 */

import { groupConsole } from '@/platform/enterprise/service';
import { defineRoute } from '@/platform/http/handler';
import { jsonSafe } from '@/platform/http/serialize';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ENTERPRISE-GROUP-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return jsonSafe(await groupConsole(principal, params.id));
  },
});
