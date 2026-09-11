/**
 * TL-API-AUTH-SECEVENTS-001 — GET /api/v1/auth/security-events
 *
 * The caller's own recent security activity: new-device sign-ins, password
 * and two-step changes, recovery-code use. Scoped to the session's user —
 * there is no user id parameter to tamper with.
 */

import { listSecurityEvents } from '@/platform/auth/security-events';
import { defineRoute } from '@/platform/http/handler';
import { errors } from '@/platform/kernel/errors';
import { isAuthenticated } from '@/platform/rbac';

export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  id: 'TL-API-AUTH-SECEVENTS-001',
  permissions: ['tl.security.audit.read.self'],
  authRequired: true,
  rateLimit: 'authenticated-standard',
  audit: false,
  handler: async ({ principal }) => {
    if (!isAuthenticated(principal)) throw errors.unauthenticated();
    return { events: await listSecurityEvents(principal.userId, 30) };
  },
});
