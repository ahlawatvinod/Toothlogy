/**
 * TL-API-PRESCRIPTION-VERIFY-001 — GET /api/v1/prescriptions/verify/:code
 *
 * The public check behind a prescription's QR code, for a pharmacist: valid or
 * cancelled, date, prescriber, practice, the patient's first name and
 * initial, and the medicines. The code is 80 random bits; unknown codes 404.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { verifyPrescription } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRESCRIPTION-VERIFY-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false,
  handler: async ({ params }) => {
    if (typeof params.code !== 'string') throw errors.validation('Code is required.');
    const result = await verifyPrescription(params.code.toUpperCase());
    if (!result) throw errors.notFound('Prescription');
    return result;
  },
});
