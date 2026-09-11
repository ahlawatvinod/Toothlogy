/**
 * TL-API-POSTING-APPLICATIONS-001 — GET /api/v1/postings/:id/applications
 *
 * Applications to one posting (tl.careers.application.read on its
 * organization), with contact details and résumés while each stands. Audited.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { postingApplications } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-POSTING-APPLICATIONS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Posting id is required.');
    return postingApplications(principal, params.id, { requestId });
  },
});
