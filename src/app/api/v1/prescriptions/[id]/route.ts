/**
 * TL-API-PRESCRIPTION-GET-001 — GET /api/v1/prescriptions/:id
 *
 * The patient, or the issuing practice's members who may read records.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { getPrescription } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRESCRIPTION-GET-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Prescription id is required.');
    return getPrescription(principal, params.id);
  },
});
