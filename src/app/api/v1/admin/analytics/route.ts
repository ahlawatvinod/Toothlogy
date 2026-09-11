/**
 * TL-API-PLATFORM-ANALYTICS-001 — GET /api/v1/admin/analytics?days=7|30|90
 *
 * Platform-wide totals for operators (tl.analytics.platform.read), computed
 * from the records; no person identified.
 */

import { defineRoute } from '@/platform/http/handler';
import { platformAnalytics, windowDays } from '@/platform/analytics/dashboards';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-PLATFORM-ANALYTICS-001',
  permissions: ['tl.analytics.platform.read'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ request, principal }) => platformAnalytics(principal, windowDays(new URL(request.url).searchParams.get('days'))),
});
