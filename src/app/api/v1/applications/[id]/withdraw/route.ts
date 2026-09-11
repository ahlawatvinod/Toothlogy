/**
 * TL-API-APPLICATION-WITHDRAW-001 — POST /api/v1/applications/:id/withdraw
 *
 * The applicant withdraws; the employer no longer sees their contact details
 * or résumé.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { withdrawApplication } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-APPLICATION-WITHDRAW-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: true,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Application id is required.');
    return withdrawApplication(principal, params.id, { requestId });
  },
});
