/**
 * TL-API-COLLEGE-RECOGNITION-001 — POST /api/v1/admin/colleges/:id/recognition { decision: VERIFY | WITHDRAW, note? }
 *
 * Toothlogy staff mark a college's stated recognition as checked against the
 * regulator's list, or withdraw that. Audited with what was checked.
 */

import { decideRecognition, recognitionSchema } from '@/platform/education/colleges';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-COLLEGE-RECOGNITION-001',
  permissions: ['tl.education.recognition.verify'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: recognitionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('College id is required.');
    await decideRecognition(principal, params.id, body, { requestId });
    return { decision: body.decision };
  },
});
