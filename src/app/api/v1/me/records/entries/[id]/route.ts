/**
 * TL-API-MY-RECORD-ENTRY-DELETE-001 — DELETE /api/v1/me/records/entries/:id
 *
 * The patient deletes an entry they added themselves. What a practice added
 * cannot be deleted by anyone (a practice retracts its own, with a reason).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { deleteMyEntry } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const DELETE = defineRoute({
  id: 'TL-API-MY-RECORD-ENTRY-DELETE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, ipAddress, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Entry id is required.');
    return deleteMyEntry(principal, params.id, { ipAddress, requestId });
  },
});
