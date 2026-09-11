/**
 * TL-API-POSTING-STATUS-001 — POST /api/v1/postings/:id/status { status: OPEN | CLOSED | FILLED }
 *
 * Publish (only a Toothlogy-verified organization), close or mark filled.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { postingStatusSchema, setPostingStatus } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-POSTING-STATUS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: postingStatusSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Posting id is required.');
    return setPostingStatus(principal, params.id, body, { requestId });
  },
});
