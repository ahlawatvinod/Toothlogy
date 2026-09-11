/**
 * TL-API-PRACTICE-PATIENTS-001 — GET /api/v1/organizations/:id/patients
 *
 * Patients who shared their record with the practice, requests waiting, and
 * recent patients one may ask (tl.records.record.read on the practice).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { practicePatients } from '@/platform/records/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRACTICE-PATIENTS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return practicePatients(principal, params.id);
  },
});
