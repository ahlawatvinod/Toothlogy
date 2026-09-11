/**
 * TL-API-PRESCRIPTION-CANCEL-001 — POST /api/v1/prescriptions/:id/cancel { reason }
 *
 * The issuing practice's prescribers cancel a prescription with a reason; the
 * QR check then shows it as cancelled. Never edited.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { cancelPrescription, retractSchema } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PRESCRIPTION-CANCEL-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: retractSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Prescription id is required.');
    return cancelPrescription(principal, params.id, body, { requestId });
  },
});
