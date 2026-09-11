/**
 * TL-API-MY-ENQUIRIES-001 — GET /api/v1/me/enquiries
 *
 * The signed-in student's admission enquiries and their status.
 */

import { myEnquiries } from '@/platform/education/enquiries';
import { defineRoute } from '@/platform/http/handler';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-ENQUIRIES-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => ({ enquiries: await myEnquiries(principal) }),
});
