/**
 * TL-API-HEALTH-001 — GET /api/v1/health
 *
 * Public liveness/readiness probe.
 *
 * Detail is gated twice: by the `verbose_health_check` feature flag and by the
 * `tl.devops.health.read` permission. Dependency names and failure messages
 * describe our internal topology, which is exactly what an attacker wants
 * early in reconnaissance — while an anonymous caller only ever needs to know
 * whether the service is up.
 */

import { defineRoute } from '@/platform/http/handler';
import { getHealthReport } from '@/platform/observability/health';
import { isFlagEnabled } from '@/platform/flags';
import { can } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-HEALTH-001',
  permissions: [],
  authRequired: false,
  rateLimit: 'public-generous',
  audit: false, // A health probe fires constantly; auditing it is pure noise.
  handler: ({ principal }) => {
    const includeDetail =
      isFlagEnabled('verbose_health_check') && can(principal, 'tl.devops.health.read');

    return getHealthReport(includeDetail);
  },
});
