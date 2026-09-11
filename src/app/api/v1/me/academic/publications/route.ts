/**
 * TL-API-PUBLICATION-ADD-001 — POST /api/v1/me/academic/publications { type, title, venue?, year, doi?, url? }
 *
 * List a publication on one's own researcher or faculty profile.
 */

import { addPublication, publicationSchema } from '@/platform/academic/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-PUBLICATION-ADD-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: publicationSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => addPublication(principal, body, { requestId }),
});
