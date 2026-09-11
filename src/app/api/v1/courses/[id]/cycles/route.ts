/**
 * TL-API-ADMISSION-CYCLE-001 — POST /api/v1/courses/:id/cycles { academicYear, opensOn, closesOn, seats?, notes? }
 *
 * A course's admission window for one academic year; saving the same year
 * again changes that window.
 */

import { cycleSchema, upsertAdmissionCycle } from '@/platform/education/colleges';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-ADMISSION-CYCLE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: cycleSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Course id is required.');
    const cycle = await upsertAdmissionCycle(principal, params.id, body, { requestId });
    return { cycleId: cycle.id, academicYear: cycle.academicYear };
  },
});
