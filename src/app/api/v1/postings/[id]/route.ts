/**
 * TL-API-POSTING-UPDATE-001 — PATCH /api/v1/postings/:id
 *
 * Edit a posting (tl.careers.posting.manage on its organization); not once
 * filled.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { postingUpdateSchema, updatePosting } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  id: 'TL-API-POSTING-UPDATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: postingUpdateSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Posting id is required.');
    return updatePosting(principal, params.id, body, { requestId });
  },
});
