/**
 * TL-API-PRACTICE-RECORD-001 — GET /api/v1/organizations/:id/patients/:userId/record
 *
 * A patient's dental record, for the practice while the patient's grant is
 * active. Every call is an audited view the patient can see. Without a grant
 * the record does not exist (404).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { practiceRecord } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRACTICE-RECORD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.userId !== 'string') throw errors.validation('Organization and patient are required.');
    return practiceRecord(principal, params.id, params.userId, { requestId });
  },
});
