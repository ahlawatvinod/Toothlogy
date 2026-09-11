/**
 * TL-API-PRACTICE-ANALYTICS-001 — GET /api/v1/organizations/:id/analytics?days=7|30|90
 *
 * The practice's dashboard numbers (tl.analytics.practice.read on it), all
 * computed from its records; no person identified.
 */

import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { practiceAnalytics, windowDays } from '@/platform/analytics/dashboards';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PRACTICE-ANALYTICS-001',
  permissions: [],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ request, principal, params }) => {
    if (typeof params.id !== 'string') throw errors.validation('Organization id is required.');
    return practiceAnalytics(principal, params.id, windowDays(new URL(request.url).searchParams.get('days')));
  },
});
