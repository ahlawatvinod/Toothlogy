/**
 * TL-API-APPLICATION-ACTION-001 — POST /api/v1/applications/:id/actions
 *   { action: SHORTLIST | INTERVIEW | OFFER | HIRE | REJECT | NOTE, message?, employerNote?, interviewAt? }
 *
 * The employer moves an application on (tl.careers.application.manage on the
 * posting's organization); the applicant is told each move. A note stays with
 * the employer.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { actOnApplication, actionSchema } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPLICATION-ACTION-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: actionSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Application id is required.');
    return actOnApplication(principal, params.id, body, { requestId });
  },
});
