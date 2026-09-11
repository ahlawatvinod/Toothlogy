/**
 * TL-API-RECORD-GRANT-001 — POST /api/v1/me/records/grants { organizationId, canWrite, days }
 *
 * The patient shares their dental record with a practice they have an
 * appointment with — read-only or read-and-add, for 30 days, a year or until
 * withdrawn — or changes the terms of an existing share.
 */

import { defineRoute } from '@/platform/http/handler';
import { grantAccess, grantSchema } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RECORD-GRANT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: grantSchema,
  audit: true,
  handler: async ({ principal, body, ipAddress, requestId }) => grantAccess(principal, body, { ipAddress, requestId }),
});
