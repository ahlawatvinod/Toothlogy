/**
 * TL-API-PRESCRIPTION-ISSUE-001 — POST /api/v1/organizations/:id/patients/:userId/prescriptions
 *
 * A verified dentist at the practice issues a prescription under a grant that
 * allows adding. Idempotent by key: a retried request returns the same one.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { issuePrescription, prescriptionSchema } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PRESCRIPTION-ISSUE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: prescriptionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string' || typeof params.userId !== 'string') throw errors.validation('Organization and patient are required.');
    return issuePrescription(principal, params.id, params.userId, body, { requestId });
  },
});
