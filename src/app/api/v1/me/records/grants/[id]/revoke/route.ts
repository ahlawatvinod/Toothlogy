/**
 * TL-API-RECORD-GRANT-REVOKE-001 — POST /api/v1/me/records/grants/:id/revoke
 *
 * The patient withdraws a practice's access; effective immediately, and the
 * consent it carried is marked withdrawn.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { revokeGrant } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RECORD-GRANT-REVOKE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, ipAddress, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Access id is required.');
    return revokeGrant(principal, params.id, { ipAddress, requestId });
  },
});
