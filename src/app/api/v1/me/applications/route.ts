/**
 * TL-API-MY-APPLICATIONS-001 — GET /api/v1/me/applications
 *
 * The applicant's applications and where each stands.
 */

import { defineRoute } from '@/platform/http/handler';
import { myApplications } from '@/platform/careers/service';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-MY-APPLICATIONS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => myApplications(principal),
});
