/**
 * TL-API-RECORD-ENTRY-RETRACT-001 — POST /api/v1/organizations/:id/record-entries/:entryId/retract { reason }
 *
 * The practice withdraws an entry it added. It stays in the record, marked,
 * with the reason — clinical history is never silently edited.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { retractEntry, retractSchema } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-RECORD-ENTRY-RETRACT-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: retractSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.entryId !== 'string') throw errors.validation('Organization and entry are required.');
    return retractEntry(principal, params.id, params.entryId, body, { requestId });
  },
});
