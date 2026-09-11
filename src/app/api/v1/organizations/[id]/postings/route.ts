/**
 * TL-API-ORG-POSTINGS-001   — GET  /api/v1/organizations/:id/postings  (with applications counted)
 * TL-API-POSTING-CREATE-001 — POST /api/v1/organizations/:id/postings  (a draft)
 *
 * tl.careers.posting.manage on the organization (reading also allowed with
 * tl.careers.application.read).
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { createPosting, organizationPostings, postingSchema } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-ORG-POSTINGS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return organizationPostings(principal, params.id);
  },
});

export const POST = defineRoute({
  id: 'TL-API-POSTING-CREATE-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: postingSchema,
  audit: true,
  handler: async ({ principal, params, body, requestId }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return createPosting(principal, params.id, body, { requestId });
  },
});
