/**
 * TL-API-CAMP-CREATE-001 — POST /api/v1/camps
 *
 * Create a district dental camp as a draft. Public only after it is
 * submitted and approved by Toothlogy staff.
 */

import { campSchema, createCamp } from '@/platform/camps/service';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  id: 'TL-API-CAMP-CREATE-001',
  permissions: ['tl.camps.camp.organize'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  bodySchema: campSchema,
  audit: true,
  handler: async ({ principal, body, requestId }) => createCamp(principal, body, { requestId }),
});
